"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { MapPin, Plus, Trash2 } from "lucide-react"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { CardRowsSkeleton } from "@/components/account/account-skeletons"
import { toast } from "sonner"

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
)

interface ClientAddress {
  id: string
  label?: string
  firstName?: string
  lastName?: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
  isDefault: boolean
}

const EMPTY_FORM = {
  label: "",
  firstName: "",
  lastName: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
}

export default function AddressesPage() {
  const { isReady } = useAuthGuard()
  const [addresses, setAddresses] = useState<ClientAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  // When Clerk is configured, addresses live on the Throttle customer
  // and persist across sessions. Without auth, the page falls back to
  // a friendly "sign in to manage saved addresses" state — the legacy
  // local-only address store has been retired.
  useEffect(() => {
    if (!isReady || !clerkConfigured) {
      setLoading(false)
      return
    }
    let cancelled = false
    fetch("/api/throttle/customer-addresses")
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          throw new Error(payload?.error?.message ?? "Failed to load addresses.")
        }
        return (await res.json()) as { addresses: ClientAddress[] }
      })
      .then(({ addresses }) => {
        if (!cancelled) setAddresses(addresses)
      })
      .catch((err: Error) => {
        if (!cancelled) toast.error(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isReady])

  if (!isReady) return null

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch("/api/throttle/customer-addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: form.label || undefined,
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          line1: form.line1,
          line2: form.line2 || undefined,
          city: form.city,
          state: form.state || undefined,
          postalCode: form.postalCode || undefined,
          country: form.country,
          isDefault: addresses.length === 0,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(payload?.error?.message ?? "Could not save the address.")
      }
      const { address } = (await res.json()) as { address: ClientAddress }
      setAddresses((prev) => [...prev, address])
      setShowForm(false)
      setForm(EMPTY_FORM)
      toast.success("Address added")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    // Optimistic remove — restore on failure.
    const previous = addresses
    setAddresses((prev) => prev.filter((a) => a.id !== id))
    try {
      const res = await fetch(`/api/throttle/customer-addresses/${id}`, {
        method: "DELETE",
      })
      if (!res.ok && res.status !== 204) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(payload?.error?.message ?? "Delete failed.")
      }
      toast("Address removed")
    } catch (err) {
      setAddresses(previous)
      toast.error(err instanceof Error ? err.message : "Delete failed.")
    }
  }

  if (!clerkConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <PageHeader title="Addresses" />
        <EmptyState
          icon={MapPin}
          title="Sign in to manage saved addresses"
          description="Saved addresses are stored on your Throttle customer record. Configure Clerk to enable this surface."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader title="Addresses">
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Address
        </Button>
      </PageHeader>

      {showForm && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>Label (optional)</Label>
                <Input name="label" placeholder="Home, Office, …" value={form.label} onChange={handleChange} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First name</Label>
                  <Input name="firstName" value={form.firstName} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label>Last name</Label>
                  <Input name="lastName" value={form.lastName} onChange={handleChange} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input name="line1" value={form.line1} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label>Apt, suite (optional)</Label>
                <Input name="line2" value={form.line2} onChange={handleChange} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>City</Label><Input name="city" value={form.city} onChange={handleChange} required /></div>
                <div className="space-y-2"><Label>State</Label><Input name="state" value={form.state} onChange={handleChange} /></div>
                <div className="space-y-2"><Label>ZIP</Label><Input name="postalCode" value={form.postalCode} onChange={handleChange} /></div>
              </div>
              <div className="space-y-2">
                <Label>Country (ISO 3166-1 alpha-2)</Label>
                <Input name="country" value={form.country} onChange={handleChange} maxLength={2} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : "Save Address"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <CardRowsSkeleton rows={2} />
      ) : addresses.length === 0 && !showForm ? (
        <EmptyState
          icon={MapPin}
          title="No saved addresses"
          description="Add an address to speed up checkout."
        />
      ) : (
        addresses.length > 0 && (
          <div className="mt-8 space-y-4">
            {addresses.map((addr) => (
              <Card key={addr.id}>
                <CardContent className="flex items-start justify-between pt-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {[addr.firstName, addr.lastName].filter(Boolean).join(" ") || addr.label || "Address"}
                      </p>
                      {addr.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}<br />
                      {addr.city}{addr.state ? `, ${addr.state}` : ""} {addr.postalCode}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(addr.id)}
                    aria-label="Remove address"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  )
}
