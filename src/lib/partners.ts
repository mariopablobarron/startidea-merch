import type { PartnerKind } from "@prisma/client";

/**
 * Datos seed para la sección "Hecho con" de la home.
 * F0: hardcoded para no depender de DB ni admin.
 * F4: pasarán a tabla Partner gestionada desde admin.
 */

export type PartnerSeed = {
  slug: string;
  name: string;
  kind: PartnerKind;
  city: string;
  region: string;
  description: string;
  services: string[];
};

export const PARTNERS_SEED: PartnerSeed[] = [
  {
    slug: "cee-placeholder-1",
    name: "Centro Especial de Empleo",
    kind: "CEE",
    city: "Madrid",
    region: "Comunidad de Madrid",
    description:
      "Equipo de personas con discapacidad especializado en serigrafía textil, manipulación y packaging para tiradas medias y grandes.",
    services: ["Serigrafía", "Bordado", "Manipulado", "Packaging"],
  },
  {
    slug: "taller-local-placeholder-1",
    name: "Taller artesano local",
    kind: "LOCAL_BUSINESS",
    city: "Toledo",
    region: "Castilla-La Mancha",
    description:
      "Pequeño taller especializado en grabado láser sobre madera y metal para regalos corporativos premium y series cortas.",
    services: ["Grabado láser", "Marcaje premium", "Series cortas"],
  },
  {
    slug: "artesano-placeholder-1",
    name: "Artesano colaborador",
    kind: "ARTISAN",
    city: "Sevilla",
    region: "Andalucía",
    description:
      "Bordado a mano y personalización textil de alta gama. Producto único, plazos artesanales y trazabilidad total.",
    services: ["Bordado a mano", "Edición limitada"],
  },
];
