import type { NotaSimpleWire } from "../extract/schemas.ts";

/**
 * Hand-written nota simple informativa (Registro Mercantil de Madrid) for the same fictional company as the other
 * fixtures, in the shape the extraction returns: names and roles as printed, no ID numbers. Not from a real nota:
 * replace with a real shape when the first ones arrive.
 */
export const notaSimpleWire: NotaSimpleWire = {
  document_type: "nota_simple",
  company_nif: "B12345674",
  company_name: "DISTRIBUCIONES EJEMPLO SL",
  legible: true,
  issue_date: "2026-09-02",
  registry: "Registro Mercantil de Madrid",
  registry_sheet: "Hoja M-654.321",
  legal_form: "Sociedad Limitada",
  registered_office: "Calle Ejemplo 12, 28001 Madrid",
  purpose: "Comercio al por mayor de productos alimenticios",
  incorporated_on: "2018-05-21",
  share_capital: 3000,
  situation: "active",
  situation_text: "",
  sole_shareholder: "GRUPO EJEMPLO INVERSIONES SL",
  positions: [
    { kind: "administrator", role: "Administrador único", name: "GARCÍA LÓPEZ, MARTA", appointed_on: "2018-05-21", page: 1 },
    { kind: "attorney", role: "Apoderado solidario", name: "RUIZ SOLER, ANA", appointed_on: "2021-03-01", page: 2 },
  ],
  page: 1,
};
