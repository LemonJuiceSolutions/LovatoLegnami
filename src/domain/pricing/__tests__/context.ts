import { FAMILY_OF, type HardwareItem, type Piece, type PieceType } from "../../components/types";
import { identity } from "../../math/mat4";
import { planAssemblyCuts } from "../assembly-cuts";
import { DEFAULT_PRICE_LIST, DEFAULT_PRICE_LIST_VERSION } from "../data/default-listino";
import { EMPTY_STATE, type PhaseState, type PricingAssembly, type PricingContext } from "../phases/shared";
import { PricingOptionsSchema, versionLabel, type PriceList, type PricingOptionsInput, type SiteFactors } from "../types";

/** Utilità dei test delle fasi: pezzi sintetici e contesto di prezzo minimo. */

let seq = 0;
export const piece = (type: PieceType, b: number, h: number, length: number, extra: Partial<Piece> = {}): Piece => ({
  id: `${FAMILY_OF[type]}-${String(++seq).padStart(3, "0")}`,
  type,
  family: FAMILY_OF[type],
  section: { b, h },
  length,
  pose: identity(),
  label: type,
  machinings: [],
  ...extra,
});

export const many = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

export const hardwareItem = (code: string, kind: HardwareItem["kind"], quantity: number, n = 1): HardwareItem => ({
  id: `HW-${String(n).padStart(2, "0")}`,
  code,
  kind,
  description: code,
  quantity,
  pieceIds: [],
  machiningIds: [],
  params: {},
});

export const FLAT_SITE: SiteFactors = {
  planDeviationDeg: 0,
  wallDeviationDeg: 0,
  floorSlopePct: 0,
  floorRangeMm: 0,
  obstaclesCount: 0,
  maxHeightMm: 2700,
  clearHeightMm: 2400,
  embedmentMm: 0,
  access: "facile",
  anchoring: "terra",
};

export function makeContext(
  assembly: PricingAssembly,
  opts: { priceList?: PriceList; options?: Partial<PricingOptionsInput>; site?: Partial<SiteFactors> } = {},
): PricingContext {
  const priceList = opts.priceList ?? DEFAULT_PRICE_LIST;
  const options = PricingOptionsSchema.parse({ species: "abete", quality: "lamellare", ...opts.options });
  return {
    assembly,
    options,
    priceList,
    version: DEFAULT_PRICE_LIST_VERSION,
    versionLabel: versionLabel(DEFAULT_PRICE_LIST_VERSION),
    siteFactors: { ...FLAT_SITE, ...opts.site },
    cutPlan: planAssemblyCuts(assembly, priceList, options),
  };
}

export const start = (extra: Partial<PhaseState> = {}): PhaseState => ({ ...EMPTY_STATE, ...extra });
