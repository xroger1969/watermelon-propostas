"use client";

import { useEffect, useState } from "react";
import type { GetYourGuideAccountStatus } from "@/types/marketplace";
import styles from "./GetYourGuideAccount.module.css";

export function GetYourGuideAccountDetails({ status }: { status: GetYourGuideAccountStatus }) {
  const account = status.supplierAccount;
  return <>
    <p className={styles.badge}>
      {account.configured ? "Conta de fornecedor configurada no CRM" : "Conta de fornecedor por configurar"}
    </p>
    <dl className={styles.facts}>
      <div><dt>Conta</dt><dd>{account.name}</dd></div>
      <div><dt>ID do fornecedor</dt><dd>{account.id || "Por configurar"}</dd></div>
      <div><dt>Catálogo GetYourGuide</dt><dd>{status.catalogEnabled
        ? `${status.productCount} atividades configuradas · ligação por validar`
        : status.catalogApiConfigured
          ? "Falta associar os IDs das atividades"
          : "Acesso à API por configurar"}</dd></div>
      <div><dt>Sincronização automática de reservas</dt><dd>Inativa</dd></div>
    </dl>
    <p className={styles.pending}>
      Falta concluir a ligação autorizada pela GetYourGuide e associar as atividades
      desta conta. As reservas ainda não são importadas automaticamente para o CRM.
    </p>
    <div className={styles.links}>
      {account.profileUrl && <a className="button button-primary" href={account.profileUrl} target="_blank" rel="noopener noreferrer">Ver perfil da empresa</a>}
      <a className="button button-outline" href={account.portalUrl} target="_blank" rel="noopener noreferrer">Abrir portal GetYourGuide</a>
    </div>
    <p className={styles.note}>No portal, confirma que a sessão corresponde ao ID de fornecedor indicado acima.</p>
  </>;
}

export default function GetYourGuideAccount({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<GetYourGuideAccountStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    setStatus(null);
    async function load() {
      try {
        const response = await fetch("/api/integrations/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Configuration unavailable");
        const data = await response.json();
        const provider = data.providers?.find((item: { provider?: string }) => item.provider === "getyourguide");
        if (!provider?.supplierAccount) throw new Error("Supplier account unavailable");
        if (!controller.signal.aborted) setStatus(provider);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  return <section id="crm-getyourguide-account" className={styles.card} aria-labelledby="crm-getyourguide-title">
    <div className={styles.header}>
      <h2 id="crm-getyourguide-title">GetYourGuide</h2>
      <button className="button button-ghost" type="button" onClick={onClose}>Fechar</button>
    </div>
    {failed ? <div role="status">
      <p>Não foi possível consultar a configuração GetYourGuide.</p>
      <button className="button button-outline" type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button>
    </div> : status ? <GetYourGuideAccountDetails status={status} /> : <p role="status">A consultar a conta GetYourGuide…</p>}
  </section>;
}
