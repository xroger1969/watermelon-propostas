"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AdminAccessButton() {
  const [visible, setVisible] = useState(false);

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let active = true;

    async function checkAccess() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!active || !sessionData.session) {
        if (active) setVisible(false);
        return;
      }

      const { error } = await supabase.rpc("watermelon_whatsapp_admin_status");
      if (active) setVisible(!error);
    }

    void checkAccess();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void checkAccess();
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  if (!visible) return null;

  return (
    <a className="nav-admin-link" href="/admin" title="Watermelon private CRM">
      Private CRM
    </a>
  );
}
