import { describe, expect, it } from "vitest";
import { adminEmails, isPlatformAdmin, parseNewLender } from "./admin.ts";

describe("platform admins", () => {
  it("reads the admin list from the environment value, in any case and separator", () => {
    expect(adminEmails(" Ana@Credia.es, luis@credia.es;pepe@x.es\nno-email ")).toEqual(["ana@credia.es", "luis@credia.es", "pepe@x.es"]);
    expect(isPlatformAdmin("ANA@credia.es", "ana@credia.es")).toBe(true);
    expect(isPlatformAdmin("otra@credia.es", "ana@credia.es")).toBe(false);
  });
  it("nobody is an admin when the list is empty or unset", () => {
    expect(isPlatformAdmin("ana@credia.es", "")).toBe(false);
    expect(isPlatformAdmin("ana@credia.es", undefined)).toBe(false);
    expect(isPlatformAdmin(null, "ana@credia.es")).toBe(false);
  });
});

describe("new lender form", () => {
  it("normalises the name and the owner's email", () => {
    expect(parseNewLender({ name: "  Fondo   Norte ", ownerEmail: " Martin@Fondo.ES " })).toEqual({ ok: true, data: { name: "Fondo Norte", ownerEmail: "martin@fondo.es" } });
  });
  it("asks for a name and a valid email", () => {
    expect(parseNewLender({ name: "F", ownerEmail: "no" })).toEqual({ ok: false, errors: { name: "Escribe el nombre de la entidad.", ownerEmail: "Escribe un correo válido." } });
  });
});
