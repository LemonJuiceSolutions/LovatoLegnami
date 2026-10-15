import { describe, expect, it } from "vitest"
import { clearSceneShot, registerSceneCapture, sceneShot, takeSceneShot } from "./scene-capture"

describe("cattura della scena (12.6)", () => {
  it("senza visualizzatore nessuna immagine; con il visualizzatore un PNG", async () => {
    clearSceneShot()
    registerSceneCapture(null)
    expect(takeSceneShot()).toBe(false)
    expect(sceneShot()).toBeNull()
    registerSceneCapture(() => `data:image/png;base64,${btoa("\x89PNG\r\n\x1a\nxyz")}`)
    expect(takeSceneShot()).toBe(true)
    const blob = sceneShot()!
    expect(blob.type).toBe("image/png")
    expect(new Uint8Array(await blob.arrayBuffer()).slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  })
})
