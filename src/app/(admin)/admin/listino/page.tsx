import { redirect } from "next/navigation"

export default function ListinoIndexPage({ searchParams }: { searchParams: { pubblica?: string } }) {
  redirect(searchParams.pubblica === "1" ? "/admin/listino/legno?pubblica=1" : "/admin/listino/legno")
}
