import { describe, it, expect, afterEach, vi } from "vitest";
import { signProposalToken, verifyProposalToken } from "./proposal-token";

/**
 * El token HMAC de propuesta es el ÚNICO guardián de dos rutas públicas:
 * `/api/proposal/[number]/pdf` (expone precios, márgenes y datos del cliente)
 * y `/api/proposal/[number]/accept` (acepta comercialmente en su nombre).
 * Estaba a cero tests.
 *
 * Lo que se fija aquí son invariantes de acceso, no la implementación:
 * quién puede entrar, con qué y hasta cuándo.
 */

const ID_A = "clx123abc456def789ghi0jkl";
const ID_B = "clzz99zz88yy77xx66ww55vv4";
const AHORA = new Date("2026-08-06T12:00:00Z");
const DIA = 24 * 3600 * 1000;

describe("proposal-token", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Deja el entorno como estaba producción: ninguna env de firma puesta. */
  function sinNingunSecretoEnProduccion() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PROPOSAL_SIGN_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("ADMIN_SECRET", "");
  }

  describe("en producción sin secreto configurado: falla CERRADO", () => {
    it("no firma: prefiere reventar a emitir un enlace que parece seguro", () => {
      sinNingunSecretoEnProduccion();
      expect(() => signProposalToken(ID_A, AHORA)).toThrow(/ADMIN_SECRET/);
    });

    it("no da por bueno NINGÚN token, ni el que firmaría el literal de dev", () => {
      // Este es el agujero que se cierra: el literal está en un repo público,
      // así que cualquiera podía firmarse un enlace válido.
      const conLiteralDeDev = signProposalToken(ID_A, AHORA);

      sinNingunSecretoEnProduccion();
      expect(verifyProposalToken(conLiteralDeDev, AHORA)).toEqual({
        valid: false,
        reason: "not-configured",
      });
    });
  });

  describe("en producción con ADMIN_SECRET: funciona, y el literal deja de valer", () => {
    it("firma y verifica con normalidad", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ADMIN_SECRET", "un-secreto-de-verdad-de-64-chars");

      const token = signProposalToken(ID_A, AHORA);
      expect(verifyProposalToken(token, AHORA)).toEqual({
        valid: true,
        proposalId: ID_A,
      });
    });

    it("un enlace firmado ANTES con el literal ya no verifica", () => {
      // Consecuencia esperada y asumida: los enlaces ya enviados por email hay
      // que reenviarlos. Se fija aquí para que nadie la descubra por sorpresa.
      const enlaceViejo = signProposalToken(ID_A, AHORA);

      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ADMIN_SECRET", "un-secreto-de-verdad-de-64-chars");

      expect(verifyProposalToken(enlaceViejo, AHORA)).toEqual({
        valid: false,
        reason: "bad-signature",
      });
    });

    it("prefiere PROPOSAL_SIGN_SECRET sobre ADMIN_SECRET", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ADMIN_SECRET", "el-de-admin");
      vi.stubEnv("PROPOSAL_SIGN_SECRET", "el-propio");
      const conElPropio = signProposalToken(ID_A, AHORA);

      vi.stubEnv("PROPOSAL_SIGN_SECRET", "");
      // Ya solo queda el de admin: el token anterior no puede validar.
      expect(verifyProposalToken(conElPropio, AHORA).valid).toBe(false);
    });
  });

  describe("camino legítimo", () => {
    it("un token recién firmado verifica y devuelve SU propuesta", () => {
      const token = signProposalToken(ID_A, AHORA);
      const res = verifyProposalToken(token, AHORA);
      expect(res).toEqual({ valid: true, proposalId: ID_A });
    });

    it("sigue siendo válido el día 29 y caduca pasados los 30", () => {
      const token = signProposalToken(ID_A, AHORA);
      const dia29 = new Date(AHORA.getTime() + 29 * DIA);
      const dia31 = new Date(AHORA.getTime() + 31 * DIA);

      expect(verifyProposalToken(token, dia29).valid).toBe(true);
      expect(verifyProposalToken(token, dia31)).toEqual({
        valid: false,
        reason: "expired",
      });
    });
  });

  describe("aislamiento entre propuestas (un cliente no ve la de otro)", () => {
    it("el id va DENTRO del token, así que el de A nunca se resuelve como B", () => {
      const tokenA = signProposalToken(ID_A, AHORA);
      const res = verifyProposalToken(tokenA, AHORA);

      expect(res.valid).toBe(true);
      // Las rutas cruzan este id con el proposalNumber de la URL; si aquí
      // saliera otro id, el cruce dejaría de proteger nada.
      expect(res.valid && res.proposalId).toBe(ID_A);
      expect(res.valid && res.proposalId).not.toBe(ID_B);
    });

    it("cambiar el id conservando la firma ajena NO cuela", () => {
      const tokenA = signProposalToken(ID_A, AHORA);
      const [, expiry, firmaDeA] = tokenA.split(".");
      const forjado = `${ID_B}.${expiry}.${firmaDeA}`;

      expect(verifyProposalToken(forjado, AHORA)).toEqual({
        valid: false,
        reason: "bad-signature",
      });
    });

    it("dos propuestas distintas producen tokens distintos", () => {
      expect(signProposalToken(ID_A, AHORA)).not.toBe(
        signProposalToken(ID_B, AHORA),
      );
    });
  });

  describe("no se puede estirar la caducidad", () => {
    it("reescribir el expiry a futuro invalida la firma en vez de renovar", () => {
      const token = signProposalToken(ID_A, AHORA);
      const [id, expiry, sig] = token.split(".");
      const dentroDeUnAnio = String(parseInt(expiry, 10) + 365 * 24 * 3600);
      const forjado = `${id}.${dentroDeUnAnio}.${sig}`;

      // Sin esto, un enlace caducado se resucitaría editando la URL.
      expect(verifyProposalToken(forjado, AHORA)).toEqual({
        valid: false,
        reason: "bad-signature",
      });
    });

    it("un expiry con sufijo no numérico se rechaza (parseInt se lo comía)", () => {
      const token = signProposalToken(ID_A, AHORA);
      const [id, expiry, sig] = token.split(".");
      const maleable = `${id}.${expiry}XYZ.${sig}`;

      // parseInt("1788603470XYZ") === 1788603470, así que la firma esperada
      // coincidía y esta variante verificaba igual que el token legítimo.
      expect(verifyProposalToken(maleable, AHORA)).toEqual({
        valid: false,
        reason: "bad-expiry",
      });
    });

    it("tampoco cuelan otras formas no canónicas del mismo número", () => {
      const token = signProposalToken(ID_A, AHORA);
      const [id, expiry, sig] = token.split(".");

      for (const raro of [` ${expiry}`, `+${expiry}`, `0${expiry}`]) {
        expect(verifyProposalToken(`${id}.${raro}.${sig}`, AHORA).valid).toBe(
          false,
        );
      }
    });
  });

  describe("entradas basura: siempre clasifica, nunca revienta", () => {
    it("un token sin las tres partes es malformed", () => {
      for (const basura of ["", "solo-una-parte", "dos.partes", "a.b.c.d"]) {
        expect(verifyProposalToken(basura, AHORA)).toEqual({
          valid: false,
          reason: "malformed",
        });
      }
    });

    it("un expiry que no es número es bad-expiry", () => {
      const sig = signProposalToken(ID_A, AHORA).split(".")[2];
      expect(verifyProposalToken(`${ID_A}.manana.${sig}`, AHORA)).toEqual({
        valid: false,
        reason: "bad-expiry",
      });
    });

    it("una firma de LONGITUD distinta no lanza, devuelve bad-signature", () => {
      const token = signProposalToken(ID_A, AHORA);
      const [id, expiry] = token.split(".");

      // timingSafeEqual explota si los buffers no miden lo mismo: si esa guarda
      // desapareciera, esto sería un 500 en una ruta pública en vez de un 401.
      for (const firma of ["x", "", "a".repeat(200)]) {
        expect(() =>
          verifyProposalToken(`${id}.${expiry}.${firma}`, AHORA),
        ).not.toThrow();
        expect(verifyProposalToken(`${id}.${expiry}.${firma}`, AHORA)).toEqual({
          valid: false,
          reason: "bad-signature",
        });
      }
    });

    it("una firma de la MISMA longitud pero distinta es bad-signature", () => {
      const token = signProposalToken(ID_A, AHORA);
      const [id, expiry, sig] = token.split(".");
      const alterada =
        (sig[0] === "A" ? "B" : "A") + sig.slice(1); // misma longitud

      expect(verifyProposalToken(`${id}.${expiry}.${alterada}`, AHORA)).toEqual({
        valid: false,
        reason: "bad-signature",
      });
    });
  });
});
