import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, UserPlus, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { api, type Friend } from "../lib/api";
import { cn } from "../lib/utils";
import { Button, ErrorNote, Input, Select } from "./ui";

const NEW = "__new";

export function useCreateFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Friend>("/friends", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }),
  });
}

/** Type a name and press Enter (without submitting the surrounding form). */
export function NewFriendInline({ onCreated, onCancel }: { onCreated: (f: Friend) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const create = useCreateFriend();
  const add = () => {
    if (!name.trim() || create.isPending) return;
    create.mutate(name.trim(), { onSuccess: onCreated });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      add();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} placeholder="Friend's name" maxLength={60} />
        <Button type="button" variant="primary" size="icon" onClick={add} disabled={!name.trim() || create.isPending} aria-label="Add friend">
          <Check className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ErrorNote error={create.error} />
    </div>
  );
}

/** Pick one friend, with "+ New friend…" at the end of the list. */
export function FriendSelect({ value, onChange, friends }: { value: string; onChange: (id: string) => void; friends: Friend[] }) {
  const [adding, setAdding] = useState(false);
  if (adding)
    return (
      <NewFriendInline
        onCreated={(f) => {
          onChange(String(f.id));
          setAdding(false);
        }}
        onCancel={() => setAdding(false)}
      />
    );
  return (
    <Select value={value} onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))} placeholder="Pick a friend">
      {friends.map((f) => (
        <option key={f.id} value={String(f.id)}>
          {f.name}
        </option>
      ))}
      <option value={NEW}>+ New friend…</option>
    </Select>
  );
}

/** Toggle chips for choosing several friends. */
export function FriendChips({ friends, picked, onToggle, onCreated }: { friends: Friend[]; picked: number[]; onToggle: (id: number) => void; onCreated: (f: Friend) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {friends.map((f) => {
          const on = picked.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onToggle(f.id)}
              aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition active:scale-95",
                on ? "border-accent/40 bg-accent/10 text-accent" : "border-line text-muted hover:bg-hover hover:text-zinc-100",
              )}
            >
              {on && <Check className="h-3 w-3" />}
              {f.name}
            </button>
          );
        })}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-muted transition hover:bg-hover hover:text-zinc-100"
          >
            {friends.length ? <Plus className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />} New friend
          </button>
        )}
      </div>
      {adding && (
        <NewFriendInline
          onCreated={(f) => {
            onCreated(f);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}
