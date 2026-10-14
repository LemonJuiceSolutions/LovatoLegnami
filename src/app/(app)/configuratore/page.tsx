"use client"

import dynamic from "next/dynamic"
import { LoadingSpinner } from "@/components/shared/loading-spinner"

// Il configuratore usa lo store persistito in localStorage e il kernel OCCT
// in un Web Worker: nessun rendering lato server (D13).
const Configuratore = dynamic(
  () => import("@/components/configuratore/configuratore").then((m) => m.Configuratore),
  {
    ssr: false,
    loading: () => <LoadingSpinner text="Caricamento configuratore..." className="py-24" />,
  }
)

export default function ConfiguratorePage() {
  return <Configuratore />
}
