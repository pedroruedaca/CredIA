import { describe, expect, it } from "vitest";
import { accountsToRemove, adminEmails, confirmsLenderName, isPlatformAdmin, parseNewLender } from "./admin.ts";

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

describe("deleting a lender", () => {
  it("confirms with the lender's name, ignoring case and spaces", () => {
    expect(confirmsLenderName("  fondo   NORTE ", "Fondo Norte")).toBe(true);
    expect(confirmsLenderName("Fondo Sur", "Fondo Norte")).toBe(false);
    expect(confirmsLenderName("   ", "")).toBe(false);
  });
  it("removes members' accounts except platform admins and people still in a lender", () => {
    const members = [
      { userId: "u1", email: "ana@fondo.es" },
      { userId: "u2", email: "Admin@credia.es" },
      { userId: "u3", email: "luis@fondo.es" },
      { userId: "u1", email: "ana@fondo.es" },
    ];
    expect(accountsToRemove(members, new Set(["u3"]), "admin@credia.es")).toEqual(["u1"]);
    expect(accountsToRemove([], new Set(), "admin@credia.es")).toEqual([]);
  });
});
