// One world-space listener for all HRTF emitters. No frame allocations.
export function updateAudioListener(audio, camera) {
  const context = audio?.context;
  if (!context || !camera?.matrixWorld) return;
  camera.updateMatrixWorld();
  const listener = context.listener, e = camera.matrixWorld.elements;
  if (listener.positionX) {
    listener.positionX.value = e[12]; listener.positionY.value = e[13]; listener.positionZ.value = e[14];
    listener.forwardX.value = -e[8]; listener.forwardY.value = -e[9]; listener.forwardZ.value = -e[10];
    listener.upX.value = e[4]; listener.upY.value = e[5]; listener.upZ.value = e[6];
  } else {
    listener.setPosition(e[12], e[13], e[14]);
    listener.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
  }
}
