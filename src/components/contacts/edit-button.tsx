"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactDrawer, type ContactValues } from "@/components/contacts/shared";

/** Small client wrapper so server pages can offer an Edit drawer. */
export function EditContactButton({ kind, initial }: { kind: "customer" | "supplier"; initial: ContactValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-4" aria-hidden /> Edit
      </Button>
      {open && <ContactDrawer kind={kind} initial={initial} open={open} onOpenChange={setOpen} />}
    </>
  );
}
