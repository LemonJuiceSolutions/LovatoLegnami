import type { MetadataRoute } from "next"
import { siteUrl } from "@/components/site/links"
import { buildRobots } from "@/components/site/seo"

/** `robots.txt`: tutto il sito pubblico, tranne aree interne, API, accesso e wizard oltre il primo passo. */
export default function robots(): MetadataRoute.Robots {
  return buildRobots(siteUrl())
}
