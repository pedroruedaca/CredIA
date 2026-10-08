import type { Metadata } from "next";
import { OpenLink } from "@/components/borrower/OpenLink";

export const metadata: Metadata = {
  title: "Documentación para tu solicitud · credIA",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Landing page of the emailed link (`/s#<token>`): the token never reaches the server in a URL. See `borrowerLink`. */
export default function OpenLinkPage() {
  return <OpenLink />;
}
