"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X } from "lucide-react"
import { useCartStore } from "@/store/cart"
import { toast } from "sonner"

export function DiscountInput() {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const applied = useCartStore((s) => s.appliedDiscount)
  const applyDiscountCode = useCartStore((s) => s.applyDiscountCode)
  const removeDiscountCode = useCartStore((s) => s.removeDiscountCode)
  const items = useCartStore((s) => s.items)

  async function handleApply(e: React.FormEvent) {
    e.preventDefault()
    if (items.length === 0) {
      toast.error("Add an item before applying a discount.")
      return
    }
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await applyDiscountCode(trimmed)
      toast.success(`Code ${trimmed.toUpperCase()} applied`)
      setCode("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply.")
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setBusy(true)
    try {
      await removeDiscountCode()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove.")
    } finally {
      setBusy(false)
    }
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-md border border-success/40 bg-success/5 px-3 py-2 text-sm">
        <span>
          <span className="text-muted-foreground">Code </span>
          <span className="font-mono">{applied.code}</span>
          <span className="text-muted-foreground"> applied</span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRemove}
          disabled={busy}
          aria-label="Remove discount code"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleApply} className="flex items-center gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Discount code"
        autoComplete="off"
        spellCheck={false}
        className="h-9 font-mono text-sm uppercase"
      />
      <Button type="submit" size="sm" variant="outline" disabled={busy || !code.trim()}>
        {busy ? "…" : "Apply"}
      </Button>
    </form>
  )
}
