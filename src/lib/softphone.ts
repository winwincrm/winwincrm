import { useEffect, useState } from "react";

// Softphone / dialer preset. Each preset maps a phone number to the URL scheme
// that its Windows/macOS/Linux installer registers with the OS. Users pick the
// one that matches the app they actually have installed — the browser then
// hands the click off to that program via the OS scheme handler.
export type Softphone =
  | "system"       // tel: — whatever the OS considers the default phone/dialer
  | "microsip"     // callto:
  | "eyebeam"      // sip:
  | "xlite"        // sip:
  | "bria"         // sip:
  | "linphone"     // sip:
  | "jitsi"        // sip:
  | "3cx"          // tel:
  | "zoiper"       // zoiperphone:
  | "skype"        // skype:...?call
  | "teams"        // ms-teams:/l/call/0/0?users=...
  | "whatsapp"     // https://wa.me/...
  | "callto"       // callto: (generic)
  | "sip";         // sip: (generic)

const KEY = "softphone:preferred";
const DEFAULT: Softphone = "system";

export const SOFTPHONES: { value: Softphone; label: string }[] = [
  { value: "system", label: "System default (tel:)" },
  { value: "microsip", label: "MicroSIP" },
  { value: "eyebeam", label: "Eyebeam" },
  { value: "xlite", label: "X-Lite" },
  { value: "bria", label: "Bria / CounterPath" },
  { value: "linphone", label: "Linphone" },
  { value: "jitsi", label: "Jitsi" },
  { value: "3cx", label: "3CX" },
  { value: "zoiper", label: "Zoiper" },
  { value: "skype", label: "Skype" },
  { value: "teams", label: "Microsoft Teams" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "callto", label: "Generic (callto:)" },
  { value: "sip", label: "Generic (sip:)" },
];

const ALL: Softphone[] = SOFTPHONES.map((s) => s.value);

export function getSoftphone(): Softphone {
  if (typeof window === "undefined") return DEFAULT;
  const v = window.localStorage.getItem(KEY) as Softphone | null;
  if (v && (ALL as string[]).includes(v)) return v;
  return DEFAULT;
}

export function setSoftphone(s: Softphone) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, s);
  window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: s }));
}

export function buildCallHref(phone: string | null | undefined, app: Softphone): string {
  const raw = (phone ?? "").replace(/[^\d+]/g, "");
  // wa.me / skype want no leading +
  const bare = raw.replace(/^\+/, "");
  switch (app) {
    case "zoiper":
      return `zoiperphone:${raw}`;
    case "eyebeam":
    case "xlite":
    case "bria":
    case "linphone":
    case "jitsi":
    case "sip":
      return `sip:${raw}`;
    case "microsip":
    case "callto":
      return `callto:${raw}`;
    case "skype":
      return `skype:${raw}?call`;
    case "teams":
      return `msteams:/l/call/0/0?users=${encodeURIComponent(raw)}`;
    case "whatsapp":
      return `https://wa.me/${bare}`;
    case "3cx":
    case "system":
    default:
      return `tel:${raw}`;
  }
}

export function useSoftphone(): [Softphone, (s: Softphone) => void] {
  const [app, setApp] = useState<Softphone>(() => getSoftphone());
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === KEY) setApp(getSoftphone());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  return [app, (s) => { setSoftphone(s); setApp(s); }];
}
