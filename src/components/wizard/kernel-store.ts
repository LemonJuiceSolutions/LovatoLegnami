import { createStore } from "zustand/vanilla"
import type { Assembly } from "@/domain/components/types"
import type { KernelClient } from "@/geometry/client"
import { INITIAL_KERNEL_STATE, kernelSlice, type KernelActions, type KernelState } from "@/stores/kernel-slice"

/**
 * Kernel geometrico del riepilogo (12.6): caricato **solo** quando il cliente preme
 * "Mostra dettagli" (modulo importato dinamicamente, il WASM parte da qui). Riusa lo
 * slice del configuratore interno con un piccolo store proprio.
 */

export interface WizardKernelState {
  readonly kernel: KernelState
  readonly derived: { readonly assembly: Assembly | null }
  setAssembly(assembly: Assembly | null): void
  readonly actions: KernelActions
}

export function createWizardKernel(kernelFactory?: () => KernelClient) {
  return createStore<WizardKernelState>()((set, get) => {
    const actions = kernelSlice<WizardKernelState>((p) => set(p), get, kernelFactory ? { kernelFactory } : {})
    return {
      kernel: INITIAL_KERNEL_STATE,
      derived: { assembly: null },
      actions,
      setAssembly(assembly) {
        if (get().derived.assembly === assembly) return
        set({ derived: { assembly } })
        actions.rebuild()
      },
    }
  })
}
export type WizardKernel = ReturnType<typeof createWizardKernel>
