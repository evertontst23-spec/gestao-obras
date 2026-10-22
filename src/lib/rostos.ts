'use client';
// Reconhecimento facial no próprio aparelho (@vladmandic/face-api). Só o "descritor" numérico
// (128 números) vai ao servidor; a foto do rosto não é enviada nem guardada.
const VERSAO = '1.7.15';
const BASE = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${VERSAO}`;

type FaceApi = {
  nets: Record<string, { loadFromUri: (u: string) => Promise<void> }>;
  TinyFaceDetectorOptions: new (o: { inputSize: number; scoreThreshold: number }) => unknown;
  detectSingleFace: (el: HTMLVideoElement, o: unknown) => {
    withFaceLandmarks: (tiny: boolean) => { withFaceDescriptor: () => Promise<{ descriptor: Float32Array; detection: { score: number } } | undefined> };
  };
};
declare global { interface Window { faceapi?: FaceApi } }

let carregando: Promise<FaceApi> | null = null;

export function carregarModelos(): Promise<FaceApi> {
  if (carregando) return carregando;
  carregando = new Promise<FaceApi>((ok, erro) => {
    const pronto = async () => {
      try {
        const fa = window.faceapi!;
        await Promise.all([
          fa.nets.tinyFaceDetector.loadFromUri(`${BASE}/model`),
          fa.nets.faceLandmark68TinyNet.loadFromUri(`${BASE}/model`),
          fa.nets.faceRecognitionNet.loadFromUri(`${BASE}/model`),
        ]);
        ok(fa);
      } catch (e) { carregando = null; erro(e); }
    };
    if (window.faceapi) { pronto(); return; }
    const s = document.createElement('script');
    s.src = `${BASE}/dist/face-api.js`; s.async = true;
    s.onload = pronto;
    s.onerror = () => { carregando = null; erro(new Error('Sem internet para baixar o reconhecimento facial (~6 MB na primeira vez).')); };
    document.head.appendChild(s);
  });
  return carregando;
}

export async function lerDescritor(fa: FaceApi, video: HTMLVideoElement) {
  const r = await fa.detectSingleFace(video, new fa.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks(true).withFaceDescriptor();
  return r ? { descritor: Array.from(r.descriptor), qualidade: r.detection.score } : null;
}

export async function abrirCamera(video: HTMLVideoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  video.srcObject = stream;
  await video.play();
  return () => stream.getTracks().forEach((t) => t.stop());
}
