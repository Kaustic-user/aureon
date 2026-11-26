"""Mutual funds and stocks: instruments, transactions, prices, portfolio."""

from __future__ import annotations

import urllib.error
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import finance, fx, prices, services
from ..db import get_session
from ..models import Account, Instrument, InvestmentTxn, PriceSnapshot
from ..schemas import (
    AmfiScheme,
    FxRate,
    InstrumentIn,
    InstrumentOut,
    InvTxnIn,
    InvTxnOut,
    PortfolioOut,
    PriceIn,
    RefreshResult,
)

router = APIRouter(prefix="/investments")
DB = Depends(get_session)

INV_FIELDS = ["instrument_id", "account_id", "date", "type", "units", "price", "usd_price", "fx_rate", "amount", "note"]


def _get(session: Session, model, obj_id: int, label: str):
    obj = session.get(model, obj_id)
    if obj is None:
        raise HTTPException(404, f"{label} {obj_id} not found")
    return obj


@router.get("/portfolio", response_model=PortfolioOut)
def get_portfolio(include_archived: bool = Query(False), session: Session = DB):
    return services.portfolio(session, include_closed=include_archived)


@router.get("/history")
def get_history(session: Session = DB):
    """Portfolio value and cost basis over time (for the value-vs-invested chart)."""
    return services.portfolio_history(session)


# --------------------------------------------------------------- instruments


@router.get("/instruments", response_model=list[InstrumentOut])
def list_instruments(session: Session = DB):
    return session.scalars(select(Instrument).order_by(Instrument.kind, Instrument.name)).all()


@router.post("/instruments", response_model=InstrumentOut, status_code=201)
def create_instrument(body: InstrumentIn, session: Session = DB):
    dup = session.scalar(
        select(Instrument).where(Instrument.kind == body.kind, Instrument.symbol == body.symbol)
    )
    if dup:
        raise HTTPException(409, f"{dup.name} is already in your portfolio")
    inst = Instrument(**body.model_dump())
    session.add(inst)
    session.commit()
    return inst


@router.put("/instruments/{inst_id}", response_model=InstrumentOut)
def update_instrument(inst_id: int, body: InstrumentIn, session: Session = DB):
    inst = _get(session, Instrument, inst_id, "instrument")
    for k, v in body.model_dump().items():
        setattr(inst, k, v)
    session.commit()
    return inst


@router.delete("/instruments/{inst_id}", status_code=204)
def delete_instrument(inst_id: int, cascade: bool = Query(False), session: Session = DB):
    inst = _get(session, Instrument, inst_id, "instrument")
    used = session.scalar(
        select(func.count()).select_from(InvestmentTxn).where(InvestmentTxn.instrument_id == inst_id)
    )
    if used and not cascade:
        raise HTTPException(409, "Instrument has transactions. Archive it instead.")
    if used and cascade:
        session.query(InvestmentTxn).filter(InvestmentTxn.instrument_id == inst_id).delete()
    session.query(PriceSnapshot).filter(PriceSnapshot.instrument_id == inst_id).delete()
    session.delete(inst)
    session.commit()
    return Response(status_code=204)


# -------------------------------------------------------------- transactions


def _check_consistent(session: Session, instrument_id: int, override: dict[int, InvTxnIn | None], new: InvTxnIn | None):
    """Replay the instrument's history with a pending change; reject if a sell would go negative."""
    txns = []
    for t in session.scalars(select(InvestmentTxn).where(InvestmentTxn.instrument_id == instrument_id)):
        if t.id in override:
            replacement = override[t.id]
            if replacement is None or replacement.instrument_id != instrument_id:
                continue
            txns.append(finance.InvTxnInput(replacement.date, replacement.type, replacement.amount, replacement.units, t.id))
        else:
            txns.append(finance.InvTxnInput(t.date, t.type, t.amount, t.units, t.id))
    if new is not None:
        txns.append(finance.InvTxnInput(new.date, new.type, new.amount, new.units, 10**12))
    try:
        finance.compute_holding(txns)
    except finance.HoldingError as e:
        raise HTTPException(422, str(e))


def _validate_inv(session: Session, body: InvTxnIn) -> None:
    _get(session, Instrument, body.instrument_id, "instrument")
    if body.account_id is not None:
        _get(session, Account, body.account_id, "account")
    if body.type in ("buy", "sell", "vest") and body.units is None:
        raise HTTPException(422, f"A {body.type} needs the number of units")
    if body.type == "dividend" and body.units is not None:
        raise HTTPException(422, "A dividend has no units")
    if body.type == "vest" and body.account_id is not None:
        raise HTTPException(422, "A vest is not paid from an account; leave the account empty")


@router.get("/instruments/{inst_id}/txns", response_model=list[InvTxnOut])
def list_inv_txns(inst_id: int, session: Session = DB):
    _get(session, Instrument, inst_id, "instrument")
    return session.scalars(
        select(InvestmentTxn)
        .where(InvestmentTxn.instrument_id == inst_id)
        .order_by(InvestmentTxn.date.desc(), InvestmentTxn.id.desc())
    ).all()


@router.post("/txns", response_model=InvTxnOut, status_code=201)
def create_inv_txn(body: InvTxnIn, session: Session = DB):
    _validate_inv(session, body)
    _check_consistent(session, body.instrument_id, {}, body)
    txn = InvestmentTxn(**body.model_dump())
    session.add(txn)
    session.flush()
    services.audit(session, "investment_txn", txn.id, "create", body.model_dump(mode="json"))
    # A buy/sell price is also a known market price for that day.
    if body.price is not None:
        _upsert_price(session, body.instrument_id, body.date, body.price, "transaction", overwrite=False)
    session.commit()
    return txn


@router.put("/txns/{txn_id}", response_model=InvTxnOut)
def update_inv_txn(txn_id: int, body: InvTxnIn, session: Session = DB):
    txn = _get(session, InvestmentTxn, txn_id, "investment transaction")
    _validate_inv(session, body)
    _check_consistent(session, txn.instrument_id, {txn.id: body}, None)
    if body.instrument_id != txn.instrument_id:
        _check_consistent(session, body.instrument_id, {}, body)
    before = services.snapshot(txn, INV_FIELDS)
    for k, v in body.model_dump().items():
        setattr(txn, k, v)
    services.audit(session, "investment_txn", txn.id, "update", {"before": before, "after": body.model_dump(mode="json")})
    session.commit()
    return txn


@router.delete("/txns/{txn_id}", status_code=204)
def delete_inv_txn(txn_id: int, session: Session = DB):
    txn = _get(session, InvestmentTxn, txn_id, "investment transaction")
    _check_consistent(session, txn.instrument_id, {txn.id: None}, None)
    services.audit(session, "investment_txn", txn.id, "delete", services.snapshot(txn, INV_FIELDS))
    session.delete(txn)
    session.commit()
    return Response(status_code=204)


# -------------------------------------------------------------------- prices


def _upsert_price(session: Session, instrument_id, d, price, source: str, overwrite: bool = True) -> None:
    snap = session.scalar(
        select(PriceSnapshot).where(PriceSnapshot.instrument_id == instrument_id, PriceSnapshot.date == d)
    )
    if snap is None:
        session.add(PriceSnapshot(instrument_id=instrument_id, date=d, price=price, source=source))
    elif overwrite:
        snap.price = price
        snap.source = source


@router.post("/prices", status_code=204)
def set_price(body: PriceIn, session: Session = DB):
    _get(session, Instrument, body.instrument_id, "instrument")
    _upsert_price(session, body.instrument_id, body.date, body.price, "manual")
    session.commit()
    return Response(status_code=204)


def _schemes_or_502(force: bool = False):
    try:
        return prices.get_schemes(force=force)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise HTTPException(502, f"Could not download NAVs from AMFI: {e}")


@router.post("/prices/refresh", response_model=RefreshResult)
def refresh_mf_navs(session: Session = DB):
    """Fetch the latest AMFI NAV for every mutual fund (matched by scheme code)."""
    schemes = _schemes_or_502(force=True)
    updated, not_found, nav_date = 0, [], None
    for inst in session.scalars(select(Instrument).where(Instrument.kind == "mutual_fund", Instrument.archived.is_(False))):
        s = schemes.get(inst.symbol)
        if s is None and inst.isin:
            s = next((x for x in schemes.values() if inst.isin in (x.isin_growth, x.isin_reinvest)), None)
        if s is None or s.nav is None or s.nav_date is None:
            not_found.append(inst.name)
            continue
        _upsert_price(session, inst.id, s.nav_date, s.nav, "amfi")
        updated += 1
        nav_date = max(nav_date, s.nav_date) if nav_date else s.nav_date
    session.commit()
    return RefreshResult(updated=updated, not_found=not_found, nav_date=nav_date)


@router.get("/fx/usd-inr", response_model=FxRate)
def usd_inr_rate(request: Request, on: date = Query(alias="date")):
    """SBI's TT buying rate for USD→INR on a date (or the latest earlier day it published one)."""
    try:
        found = fx.get_rate(on, request.app.state.db_path.parent)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        raise HTTPException(502, f"Could not download SBI's USD rates: {e}")
    if found is None:
        raise HTTPException(404, "No SBI rate before 6 Jan 2020. Enter the rate manually.")
    return FxRate(date=on, rate_date=found[0], rate=found[1], source="SBI TT buying rate")


@router.get("/amfi/search", response_model=list[AmfiScheme])
def amfi_search(q: str = Query(min_length=2, max_length=100)):
    schemes = _schemes_or_502()
    return [
        AmfiScheme(code=s.code, isin=s.isin_growth or s.isin_reinvest, name=s.name, nav=s.nav, nav_date=s.nav_date)
        for s in prices.search(schemes, q)
    ]
