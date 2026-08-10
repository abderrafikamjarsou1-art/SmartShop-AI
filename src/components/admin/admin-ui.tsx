"use client";

import { useState, useTransition } from "react";
import { Ban, Eye, Megaphone, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  adminSuspendBusiness, adminReactivateBusiness, adminSetPlan, adminImpersonate, adminBroadcast,
} from "@/actions/billing-admin";
import { SearchInput, Pagination } from "@/components/shared/interactive";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BusinessRow {
  id: string; name: string; plan: string; status: string;
  members: number; products: number; sales: number;
  suspended: boolean; createdAt: string;
}

export function AdminBusinessTable({ businesses, totalPages }: { businesses: BusinessRow[]; totalPages: number }) {
  const [pending, start] = useTransition();
  const [suspendTarget, setSuspendTarget] = useState<BusinessRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  return (
    <>
      <div className="mb-3"><SearchInput placeholder="Search businesses…" /></div>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Business</TableHead><TableHead>Plan</TableHead><TableHead>Members</TableHead>
              <TableHead>Products</TableHead><TableHead>Sales</TableHead><TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {businesses.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <span className="font-medium">{b.name}</span>
                  {b.suspended && <Badge variant="outline" className="ml-2 text-destructive">Suspended</Badge>}
                </TableCell>
                <TableCell>
                  <Select defaultValue={b.plan} onValueChange={(plan) => start(async () => {
                    const r = await adminSetPlan({ businessId: b.id, plan });
                    if (r.success) {
                      toast.success(`${b.name} → ${plan}`);
                    } else {
                      toast.error(r.error);
                    }
                  })}>
                    <SelectTrigger className="h-8 w-28" aria-label={`Plan for ${b.name}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FREE">Free</SelectItem>
                      <SelectItem value="PRO">Pro</SelectItem>
                      <SelectItem value="BUSINESS">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="tabular">{b.members}</TableCell>
                <TableCell className="tabular">{b.products}</TableCell>
                <TableCell className="tabular">{b.sales}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => {
                      const r = await adminImpersonate(b.id);
                      if (r && !r.success) toast.error(r.error);
                    })}>
                      <Eye className="size-3.5" aria-hidden /> View as
                    </Button>
                    {b.suspended ? (
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => {
                        const r = await adminReactivateBusiness(b.id);
                        if (r.success) {
                          toast.success("Reactivated.");
                        } else {
                          toast.error(r.error);
                        }
                      })}>
                        <RotateCcw className="size-3.5" aria-hidden /> Reactivate
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setSuspendTarget(b)}>
                        <Ban className="size-3.5" aria-hidden /> Suspend
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination page={1} totalPages={totalPages} />

      {/* Suspend dialog (reason required, audited) */}
      <Dialog open={suspendTarget !== null} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Suspend {suspendTarget?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            All members lose access immediately. The reason is written to the audit log.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="suspendReason">Reason</Label>
            <Input id="suspendReason" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!suspendReason.trim() || pending} onClick={() => start(async () => {
              const r = await adminSuspendBusiness({ businessId: suspendTarget!.id, reason: suspendReason });
              if (r.success) { toast.success("Business suspended."); setSuspendTarget(null); setSuspendReason(""); }
              else toast.error(r.error);
            })}>
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminBroadcast() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  return (
    <Card className="shadow-soft">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-primary" aria-hidden />
          <h2 className="display-tight text-lg font-semibold">Platform notification</h2>
        </div>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Notification title" />
        <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message" aria-label="Notification message" />
        <Button disabled={pending || !title.trim() || !message.trim()} onClick={() => start(async () => {
          const r = await adminBroadcast({ title, message });
          if (r.success) { toast.success(`Sent to ${r.data.count} businesses.`); setTitle(""); setMessage(""); }
          else toast.error(r.error);
        })}>
          {pending ? "Sending…" : "Broadcast to all businesses"}
        </Button>
      </CardContent>
    </Card>
  );
}
