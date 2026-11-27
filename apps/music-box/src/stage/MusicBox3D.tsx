import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import { useReducedMotion, useThemeColors } from '@x10/shared/ui';

import type { EnrichedCampaign, EnrichedMusicBox } from '../domain/campaigns';
import type { CylinderFocus, CylinderLens, MusicRole } from './stageTypes';

interface MusicBox3DProps {
  data: EnrichedMusicBox;
  lens: CylinderLens;
  role: MusicRole;
  focus: CylinderFocus;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChime?: (channel: 'email' | 'sms' | 'push') => void;
}

function pinHex(e: EnrichedCampaign, lens: CylinderLens, dark: boolean): number {
  const PLUM = dark ? 0xd98ec4 : 0x8e3b76;
  const TEAL = dark ? 0x52c4b0 : 0x1c7d6e;
  const AMBER = 0xf59e0b;
  const RED = dark ? 0xf87171 : 0xdc2626;
  const BLUE = dark ? 0x60a5fa : 0x2563eb;
  const STEEL = dark ? 0xcbd5e1 : 0x475569;

  if (e.collidesWithIds.length > 0 && lens === 'touches') return AMBER;

  switch (lens) {
    case 'touches':
      if (e.overCap) return RED;
      if (e.collidesWithIds.length > 0) return AMBER;
      return PLUM;
    case 'channel':
      return e.campaign.channel === 'email' ? PLUM : e.campaign.channel === 'sms' ? AMBER : TEAL;
    case 'status':
      if (e.campaign.status === 'paused') return RED;
      if (e.campaign.status === 'sending') return TEAL;
      if (e.campaign.status === 'draft') return AMBER;
      if (e.campaign.status === 'sent') return STEEL;
      return PLUM;
    case 'unsub':
      if (e.unsubCheck.shouldPause || e.campaign.status === 'paused') return RED;
      if (e.unsubCheck.unsubRatePct >= 0.3) return AMBER;
      return TEAL;
    case 'owner':
      return e.campaign.ownerSub.includes('lead') ? PLUM : BLUE;
  }
}

export default function MusicBox3D({
  data,
  lens,
  focus,
  selectedId,
  onSelect,
  onChime,
}: MusicBox3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const colors = useThemeColors();
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const width = Math.max(300, el.clientWidth);
    const height = Math.max(280, el.clientHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    const camZ = width < 520 ? 16.5 : 11.6;
    camera.position.set(0, 4.5, camZ);
    camera.lookAt(0, -0.15, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    // Warm studio lighting
    const ambient = new THREE.AmbientLight(colors.dark ? 0xd8c8dc : 0xfff8f0, colors.dark ? 0.9 : 1.15);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffe7c2, colors.dark ? 1.7 : 1.45);
    keyLight.position.set(5, 8, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(colors.dark ? 0xb56ea8 : 0xc084b5, 0.85);
    rimLight.position.set(-6, 3, -4);
    scene.add(rimLight);

    const drumLength = 7.4;
    const drumRadius = 1.45;
    const drumGroup = new THREE.Group();
    scene.add(drumGroup);

    // Brushed brass cylinder
    const brassMat = new THREE.MeshStandardMaterial({
      color: colors.dark ? 0xb58d4c : 0xd4ad68,
      metalness: 0.72,
      roughness: 0.34,
    });
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(drumRadius, drumRadius, drumLength, 64, 1), brassMat);
    cylinder.rotation.z = Math.PI / 2;
    drumGroup.add(cylinder);

    // Dark walnut/obsidian end caps
    const capMat = new THREE.MeshStandardMaterial({
      color: colors.dark ? 0x261d2b : 0x3b2a3c,
      metalness: 0.3,
      roughness: 0.6,
    });
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(drumRadius + 0.08, drumRadius + 0.08, 0.22, 48), capMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = side * (drumLength / 2 + 0.11);
      drumGroup.add(cap);
    }

    // Segment divider grooves & red over-cap rims
    const segCount = Math.max(1, data.segments.length);
    const segIndexMap = new Map(data.segments.map((s, i) => [s.segment.id, i]));
    const segX = (idx: number) => ((idx + 0.5) / segCount - 0.5) * (drumLength - 0.7);

    data.segments.forEach((seg, idx) => {
      const x = segX(idx);
      const ringGeo = new THREE.TorusGeometry(drumRadius + 0.015, seg.anyOverCap ? 0.032 : 0.009, 12, 64);
      const ringMat = new THREE.MeshStandardMaterial({
        color: seg.anyOverCap ? 0xdc2626 : colors.dark ? 0x7a5e32 : 0x9c7b42,
        emissive: seg.anyOverCap ? 0x991b1b : 0x000000,
        emissiveIntensity: seg.anyOverCap ? 0.7 : 0,
        metalness: 0.5,
        roughness: 0.4,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = x;
      drumGroup.add(ring);
    });

    // Steel pins (each campaign = one pin at (segmentX, hourAngle))
    const pinMeshes: THREE.Mesh[] = [];
    const pinPositions = new Map<string, THREE.Vector3>();

    for (const e of data.campaigns) {
      const idx = segIndexMap.get(e.campaign.segmentId) ?? 0;
      const x = segX(idx);
      const d = new Date(e.campaign.sendAt);
      const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
      const theta = (hour / 24) * Math.PI * 2;

      const pinHeight = 0.22 + Math.min(0.65, (e.campaign.audience / 60000) * 0.62);
      const isSelected = selectedId === e.campaign.id;
      const isAmber = e.collidesWithIds.length > 0;
      const hex = pinHex(e, lens, colors.dark);

      const dimmed =
        (focus.kind === 'overcap' && !e.overCap) ||
        (focus.kind === 'quiet' && e.quietViolations.length === 0) ||
        (focus.kind === 'paused' && e.campaign.status !== 'paused') ||
        (focus.kind === 'warmup' && !e.needsWarmUpFlag && !e.campaign.waveGroup) ||
        (focus.kind === 'override' && !e.awaitingOverride) ||
        (focus.kind === 'collision' && e.collidesWithIds.length === 0);

      const pinMat = new THREE.MeshStandardMaterial({
        color: hex,
        emissive: isSelected || isAmber ? hex : 0x000000,
        emissiveIntensity: isSelected ? 0.9 : isAmber ? 0.55 : 0,
        metalness: 0.75,
        roughness: 0.25,
        transparent: dimmed,
        opacity: dimmed ? 0.22 : 1,
      });

      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(isSelected ? 0.055 : 0.038, 0.045, pinHeight, 12),
        pinMat,
      );

      const radial = drumRadius + pinHeight / 2;
      const y = Math.cos(theta) * radial;
      const z = Math.sin(theta) * radial;
      pin.position.set(x, y, z);
      pin.rotation.x = theta;
      pin.userData = { campaignId: e.campaign.id, channel: e.campaign.channel };
      drumGroup.add(pin);
      pinMeshes.push(pin);

      // Tip position for collision tie arcs
      const tipRadial = drumRadius + pinHeight + 0.04;
      pinPositions.set(e.campaign.id, new THREE.Vector3(x, Math.cos(theta) * tipRadial, Math.sin(theta) * tipRadial));
    }

    // Amber collision tie arcs between pins within 2h in overlapping rows
    const tieMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9 });
    for (const pair of data.collisions) {
      const pA = pinPositions.get(pair.aId);
      const pB = pinPositions.get(pair.bId);
      if (!pA || !pB) continue;
      const mid = pA.clone().add(pB).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(drumRadius + 0.95);
      const curve = new THREE.QuadraticBezierCurve3(pA, mid, pB);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
      drumGroup.add(new THREE.Line(geo, tieMat));
    }

    // 3-tine steel comb fixed at the front (Email, SMS, Push)
    const combGroup = new THREE.Group();
    const combMat = new THREE.MeshStandardMaterial({
      color: colors.dark ? 0xdbe3ee : 0x64748b,
      metalness: 0.85,
      roughness: 0.2,
    });
    const baseBar = new THREE.Mesh(new THREE.BoxGeometry(drumLength * 0.85, 0.16, 0.45), combMat);
    baseBar.position.set(0, -0.35, drumRadius + 1.15);
    combGroup.add(baseBar);

    [-1.8, 0, 1.8].forEach((tx, idx) => {
      const tineColor = idx === 0 ? 0x9b4d86 : idx === 1 ? 0xd97706 : 0x1c7d6e;
      const tine = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.07, 1.05),
        new THREE.MeshStandardMaterial({ color: tineColor, metalness: 0.7, roughness: 0.25 }),
      );
      tine.position.set(tx, -0.26, drumRadius + 0.62);
      combGroup.add(tine);
    });
    scene.add(combGroup);

    // Initial rotation so afternoon/evening pins & amber collision ties shine on top-front face
    drumGroup.rotation.x = 2.15;

    // Pointer drag + raycast click
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let dragged = false;
    let lastY = 0;

    const onPointerDown = (ev: PointerEvent) => {
      dragging = true;
      dragged = false;
      lastY = ev.clientY;
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (!dragging) return;
      const dy = ev.clientY - lastY;
      if (Math.abs(dy) > 2) dragged = true;
      drumGroup.rotation.x += dy * 0.008;
      lastY = ev.clientY;
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (!dragged) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(pinMeshes, false);
        if (hits.length > 0) {
          const { campaignId, channel } = hits[0].object.userData as {
            campaignId: string;
            channel: 'email' | 'sms' | 'push';
          };
          onSelect(campaignId === selectedId ? null : campaignId);
          onChime?.(channel);
        } else {
          onSelect(null);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    let rafId = 0;
    const renderLoop = () => {
      if (!reduced && !document.hidden && !dragging) {
        drumGroup.rotation.x += 0.0022;
      }
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const ro = new ResizeObserver(() => {
      if (!el) return;
      const w = Math.max(300, el.clientWidth);
      const h = Math.max(280, el.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
    };
  }, [data, lens, focus, selectedId, colors.dark, reduced, onSelect, onChime]);

  return (
    <div
      ref={containerRef}
      className="h-full w-[calc(100%-var(--side-w,0px))] cursor-grab active:cursor-grabbing"
      role="img"
      aria-label="3D brass music-box cylinder with campaign pins and three-tine channel comb"
      data-testid="music-box-3d"
    />
  );
}
