/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, Download, Copy, Check, RotateCcw, Trophy, Play, Pause } from 'lucide-react';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // React state for external controls/overlays and metrics
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [currentScore, setCurrentScore] = useState<number>(0);
  const [bestScore, setBestScore] = useState<number>(() => {
    try {
      const s = localStorage.getItem('flappy_standalone_best');
      return s ? parseInt(s, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAMEOVER'>('START');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Audio Context ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playSound = useCallback((type: 'flap' | 'score' | 'hit' | 'die') => {
    if (!soundEnabled) return;
    const actx = getAudioContext();
    if (!actx) return;

    const now = actx.currentTime;
    try {
      if (type === 'flap') {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(360, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.12);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      } else if (type === 'score') {
        const osc1 = actx.createOscillator();
        const osc2 = actx.createOscillator();
        const gain = actx.createGain();
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(784, now);
        osc2.frequency.setValueAtTime(1046, now + 0.08);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.setValueAtTime(0.25, now + 0.08);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.24);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(actx.destination);
        osc1.start(now);
        osc1.stop(now + 0.08);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.25);
      } else if (type === 'hit') {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'die') {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.35);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
        osc.connect(gain);
        gain.connect(actx.destination);
        osc.start(now);
        osc.stop(now + 0.36);
      }
    } catch {
      // Audio autoplay policy catch
    }
  }, [getAudioContext, soundEnabled]);

  // Synchronize best score to localStorage
  const updateBestScore = useCallback((newScore: number) => {
    setBestScore((prev) => {
      if (newScore > prev) {
        try {
          localStorage.setItem('flappy_standalone_best', newScore.toString());
        } catch {
          // ignore localStorage error
        }
        return newScore;
      }
      return prev;
    });
  }, []);

  // Main canvas game engine refs
  const engineRef = useRef<{
    state: 'START' | 'PLAYING' | 'GAMEOVER';
    isPaused: boolean;
    score: number;
    frameCount: number;
    groundOffset: number;
    cloudsOffset: number;
    cityOffset: number;
    screenShake: number;
    screenFlash: number;
    currentSpeed: number;
    pipeSpawnTimer: number;
    pipes: Array<{ x: number; topHeight: number; bottomY: number; passed: boolean }>;
    particles: Array<{ x: number; y: number; vx: number; vy: number; color: string; radius: number; life: number; maxLife: number }>;
    bird: {
      x: number;
      y: number;
      radius: number;
      vy: number;
      gravity: number;
      jumpForce: number;
      rotation: number;
      wingTimer: number;
      wingState: number;
    };
    triggerAction: () => void;
  }>({
    state: 'START',
    isPaused: false,
    score: 0,
    frameCount: 0,
    groundOffset: 0,
    cloudsOffset: 0,
    cityOffset: 0,
    screenShake: 0,
    screenFlash: 0,
    currentSpeed: 2.4,
    pipeSpawnTimer: 0,
    pipes: [],
    particles: [],
    bird: {
      x: 95,
      y: 260,
      radius: 14,
      vy: 0,
      gravity: 0.38,
      jumpForce: -6.8,
      rotation: 0,
      wingTimer: 0,
      wingState: 0,
    },
    triggerAction: () => {},
  });

  // Keep paused state in sync
  useEffect(() => {
    engineRef.current.isPaused = isPaused;
  }, [isPaused]);

  // Game Loop and Canvas Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const V_WIDTH = 400;
    const V_HEIGHT = 600;
    const GROUND_HEIGHT = 90;
    const GROUND_Y = V_HEIGHT - GROUND_HEIGHT;
    const PIPE_WIDTH = 64;
    const PIPE_CAP_HEIGHT = 26;
    const PIPE_CAP_OVERHANG = 3;
    const GAP_SIZE = 142;

    const clouds = [
      { x: 30, y: 70, scale: 1.1 },
      { x: 170, y: 130, scale: 0.8 },
      { x: 310, y: 60, scale: 1.2 },
      { x: 440, y: 110, scale: 0.9 },
    ];

    const buildings = [
      { x: 10, w: 32, h: 65 },
      { x: 48, w: 24, h: 90 },
      { x: 78, w: 38, h: 50 },
      { x: 122, w: 28, h: 75 },
      { x: 156, w: 35, h: 105 },
      { x: 198, w: 26, h: 60 },
      { x: 230, w: 34, h: 85 },
      { x: 270, w: 40, h: 70 },
      { x: 316, w: 26, h: 95 },
      { x: 348, w: 36, h: 55 },
      { x: 390, w: 30, h: 80 },
    ];

    function resize() {
      if (!canvas || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx?.resetTransform();
      ctx?.scale((rect.width / V_WIDTH) * dpr, (rect.height / V_HEIGHT) * dpr);
    }

    resize();
    window.addEventListener('resize', resize);

    const eng = engineRef.current;

    function addParticle(x: number, y: number, vx: number, vy: number, color: string, radius: number, life: number) {
      eng.particles.push({ x, y, vx, vy, color, radius, life, maxLife: life });
    }

    function spawnPipe() {
      const minHeight = 60;
      const maxHeight = GROUND_Y - GAP_SIZE - minHeight;
      const topHeight = Math.floor(minHeight + Math.random() * (maxHeight - minHeight));
      const bottomY = topHeight + GAP_SIZE;

      eng.pipes.push({
        x: V_WIDTH + 10,
        topHeight,
        bottomY,
        passed: false,
      });
    }

    function triggerGameOver() {
      if (eng.state === 'GAMEOVER') return;
      eng.state = 'GAMEOVER';
      setGameState('GAMEOVER');
      eng.screenShake = 16;
      eng.screenFlash = 1.0;
      playSound('hit');
      setTimeout(() => {
        playSound('die');
      }, 120);

      // Dust particles
      for (let i = 0; i < 14; i++) {
        addParticle(
          eng.bird.x,
          Math.min(eng.bird.y + 10, GROUND_Y),
          (Math.random() - 0.5) * 6,
          -Math.random() * 4 - 1,
          '#e5d59f',
          Math.random() * 4 + 2,
          24
        );
      }
    }

    function checkPipeCollision(b: typeof eng.bird, p: { x: number; topHeight: number; bottomY: number }) {
      const bLeft = b.x - b.radius + 2;
      const bRight = b.x + b.radius - 2;
      const bTop = b.y - b.radius + 2;
      const bBottom = b.y + b.radius - 2;

      const pLeft = p.x;
      const pRight = p.x + PIPE_WIDTH;

      if (bRight > pLeft && bLeft < pRight) {
        if (bTop < p.topHeight) return true;
        if (bBottom > p.bottomY) return true;
      }
      return false;
    }

    function flapBird() {
      eng.bird.vy = eng.bird.jumpForce;
      playSound('flap');
      for (let i = 0; i < 4; i++) {
        addParticle(
          eng.bird.x - 12 + (Math.random() * 4 - 2),
          eng.bird.y + 6 + (Math.random() * 4 - 2),
          -1.5 - Math.random() * 1.5,
          Math.random() * 2 - 1,
          'rgba(255, 255, 255, 0.7)',
          3.5,
          18
        );
      }
    }

    function resetGame() {
      eng.state = 'START';
      setGameState('START');
      eng.score = 0;
      setCurrentScore(0);
      eng.pipes = [];
      eng.pipeSpawnTimer = 0;
      eng.currentSpeed = 2.4;
      eng.bird.x = 95;
      eng.bird.y = 260;
      eng.bird.vy = 0;
      eng.bird.rotation = 0;
      eng.bird.wingTimer = 0;
      eng.bird.wingState = 0;
    }

    eng.triggerAction = () => {
      getAudioContext();
      if (eng.isPaused) return;

      if (eng.state === 'START') {
        eng.state = 'PLAYING';
        setGameState('PLAYING');
        flapBird();
      } else if (eng.state === 'PLAYING') {
        flapBird();
      } else if (eng.state === 'GAMEOVER') {
        resetGame();
      }
    };

    // Rendering Helpers
    function drawPipeCylinder(x: number, y: number, w: number, h: number) {
      if (!ctx || h <= 0) return;
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#53a826');
      grad.addColorStop(0.18, '#8de042');
      grad.addColorStop(0.45, '#56b823');
      grad.addColorStop(0.82, '#2f6e12');
      grad.addColorStop(1, '#1b4408');

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = '#143807';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(x + 7, y, 4, h);
    }

    function drawPipeCap(x: number, y: number, w: number, h: number) {
      if (!ctx) return;
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#5ec72d');
      grad.addColorStop(0.18, '#9cf04b');
      grad.addColorStop(0.45, '#5fb823');
      grad.addColorStop(0.82, '#2f6e12');
      grad.addColorStop(1, '#1b4408');

      ctx.fillStyle = grad;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, 2);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.fill();

      ctx.strokeStyle = '#143807';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(x + 8, y + 2, 4, h - 4);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(x, y + h - 3, w, 2);
    }

    function drawMedal(x: number, y: number, sc: number) {
      if (!ctx) return;
      ctx.save();
      ctx.translate(x, y);

      let medalColor = '#94a3b8';
      let ribbonColor = '#dc2626';
      let label = 'NONE';

      if (sc >= 40) {
        medalColor = '#38bdf8'; // Platinum
        ribbonColor = '#9333ea';
        label = 'PLAT';
      } else if (sc >= 30) {
        medalColor = '#facc15'; // Gold
        ribbonColor = '#dc2626';
        label = 'GOLD';
      } else if (sc >= 20) {
        medalColor = '#e2e8f0'; // Silver
        ribbonColor = '#2563eb';
        label = 'SILV';
      } else if (sc >= 10) {
        medalColor = '#d97706'; // Bronze
        ribbonColor = '#16a34a';
        label = 'BRNZ';
      }

      // Ribbon
      ctx.fillStyle = ribbonColor;
      ctx.beginPath();
      ctx.moveTo(-16, -34);
      ctx.lineTo(0, -14);
      ctx.lineTo(16, -34);
      ctx.lineTo(8, -34);
      ctx.lineTo(0, -22);
      ctx.lineTo(-8, -34);
      ctx.closePath();
      ctx.fill();

      // Coin
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fillStyle = medalColor;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#78350f';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-6, -6, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '900 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#78350f';
      ctx.fillText(label, 0, 4);

      ctx.restore();
    }

    let animationFrameId: number;

    function render() {
      if (!ctx) return;
      eng.frameCount++;

      if (!eng.isPaused) {
        // Update physics
        if (eng.state === 'START') {
          eng.bird.y = 260 + Math.sin(eng.frameCount * 0.08) * 8;
          eng.bird.rotation = 0;
          eng.bird.wingTimer++;
          if (eng.bird.wingTimer % 6 === 0) {
            eng.bird.wingState = (eng.bird.wingState + 1) % 3;
          }
        } else if (eng.state === 'PLAYING') {
          eng.bird.vy += eng.bird.gravity;
          eng.bird.y += eng.bird.vy;

          if (eng.bird.vy < 0) {
            eng.bird.rotation = Math.max(-0.48, -0.48 * (-eng.bird.vy / 6.8));
          } else {
            eng.bird.rotation = Math.min(Math.PI / 2, eng.bird.rotation + 0.05);
          }

          if (eng.bird.vy < 2) {
            eng.bird.wingTimer++;
            if (eng.bird.wingTimer % 4 === 0) {
              eng.bird.wingState = (eng.bird.wingState + 1) % 3;
            }
          } else {
            eng.bird.wingState = 1;
          }

          if (eng.bird.y + eng.bird.radius >= GROUND_Y) {
            eng.bird.y = GROUND_Y - eng.bird.radius;
            triggerGameOver();
          }

          if (eng.bird.y - eng.bird.radius <= 0) {
            eng.bird.y = eng.bird.radius;
            eng.bird.vy = 0;
          }

          // Difficulty Speed Scaling
          eng.currentSpeed = Math.min(4.6, 2.4 + Math.floor(eng.score / 5) * 0.16);
          eng.pipeSpawnTimer++;
          const interval = Math.max(76, Math.floor(125 * (2.4 / eng.currentSpeed)));
          if (eng.pipeSpawnTimer >= interval) {
            spawnPipe();
            eng.pipeSpawnTimer = 0;
          }

          for (let i = eng.pipes.length - 1; i >= 0; i--) {
            const p = eng.pipes[i];
            p.x -= eng.currentSpeed;

            if (!p.passed && p.x + PIPE_WIDTH < eng.bird.x) {
              p.passed = true;
              eng.score++;
              setCurrentScore(eng.score);
              updateBestScore(eng.score);
              playSound('score');
            }

            if (checkPipeCollision(eng.bird, p)) {
              triggerGameOver();
            }

            if (p.x + PIPE_WIDTH + 20 < 0) {
              eng.pipes.splice(i, 1);
            }
          }
        }
      }

      // Screen Shake
      let shakeX = 0;
      let shakeY = 0;
      if (eng.screenShake > 0) {
        shakeX = (Math.random() - 0.5) * eng.screenShake;
        shakeY = (Math.random() - 0.5) * eng.screenShake;
        eng.screenShake *= 0.85;
        if (eng.screenShake < 0.5) eng.screenShake = 0;
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      skyGrad.addColorStop(0, '#4ec0ca');
      skyGrad.addColorStop(0.7, '#7cdbf2');
      skyGrad.addColorStop(1, '#bcf2fb');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, V_WIDTH, GROUND_Y);

      // Clouds
      eng.cloudsOffset = (eng.cloudsOffset + (eng.state === 'PLAYING' && !eng.isPaused ? eng.currentSpeed * 0.25 : 0.4)) % 400;
      for (const cloud of clouds) {
        const drawX = ((cloud.x - eng.cloudsOffset + 500) % 500) - 60;
        ctx.save();
        ctx.translate(drawX, cloud.y);
        ctx.scale(cloud.scale, cloud.scale);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.arc(18, -8, 24, 0, Math.PI * 2);
        ctx.arc(42, -4, 20, 0, Math.PI * 2);
        ctx.arc(58, 4, 15, 0, Math.PI * 2);
        ctx.arc(28, 12, 18, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Hills & Skyline
      eng.cityOffset = (eng.cityOffset + (eng.state === 'PLAYING' && !eng.isPaused ? eng.currentSpeed * 0.45 : 0.6)) % 400;
      const baseSkylineY = GROUND_Y - 2;

      ctx.fillStyle = '#8bd7b7';
      for (let x = -60; x <= V_WIDTH + 60; x += 110) {
        const hillX = ((x - eng.cityOffset * 0.5) % (V_WIDTH + 140)) - 40;
        ctx.beginPath();
        ctx.arc(hillX + 60, baseSkylineY + 50, 80, Math.PI, 0);
        ctx.fill();
      }

      ctx.fillStyle = '#65b89a';
      for (const b of buildings) {
        const bx = ((b.x - eng.cityOffset + 440) % 440) - 30;
        ctx.fillRect(bx, baseSkylineY - b.h, b.w, b.h);

        ctx.fillStyle = 'rgba(255, 255, 230, 0.4)';
        for (let wy = baseSkylineY - b.h + 8; wy < baseSkylineY - 8; wy += 14) {
          ctx.fillRect(bx + 4, wy, 4, 6);
          if (b.w > 26) ctx.fillRect(bx + b.w - 8, wy, 4, 6);
        }
        ctx.fillStyle = '#65b89a';
      }

      // Pipes
      for (const p of eng.pipes) {
        const topBodyHeight = p.topHeight - PIPE_CAP_HEIGHT;
        drawPipeCylinder(p.x, 0, PIPE_WIDTH, topBodyHeight);
        drawPipeCap(p.x - PIPE_CAP_OVERHANG, topBodyHeight, PIPE_WIDTH + PIPE_CAP_OVERHANG * 2, PIPE_CAP_HEIGHT);

        const bottomCapY = p.bottomY;
        const bottomBodyY = p.bottomY + PIPE_CAP_HEIGHT;
        const bottomBodyHeight = GROUND_Y - bottomBodyY;
        drawPipeCap(p.x - PIPE_CAP_OVERHANG, bottomCapY, PIPE_WIDTH + PIPE_CAP_OVERHANG * 2, PIPE_CAP_HEIGHT);
        drawPipeCylinder(p.x, bottomBodyY, PIPE_WIDTH, bottomBodyHeight);
      }

      // Ground Parallax
      if (!eng.isPaused) {
        if (eng.state === 'PLAYING') {
          eng.groundOffset = (eng.groundOffset + eng.currentSpeed) % 24;
        } else if (eng.state === 'START') {
          eng.groundOffset = (eng.groundOffset + 1.8) % 24;
        }
      }

      ctx.fillStyle = '#73bf2e';
      ctx.fillRect(0, GROUND_Y, V_WIDTH, 14);
      ctx.fillStyle = '#9fe855';
      ctx.fillRect(0, GROUND_Y, V_WIDTH, 3);
      ctx.fillStyle = '#52941b';
      ctx.fillRect(0, GROUND_Y + 12, V_WIDTH, 2);

      ctx.fillStyle = '#ded895';
      ctx.fillRect(0, GROUND_Y + 14, V_WIDTH, GROUND_HEIGHT - 14);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, GROUND_Y + 14, V_WIDTH, GROUND_HEIGHT - 14);
      ctx.clip();

      ctx.fillStyle = '#c8bc73';
      const step = 20;
      for (let x = -30 - eng.groundOffset; x < V_WIDTH + 40; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y + 14);
        ctx.lineTo(x + 10, GROUND_Y + 14);
        ctx.lineTo(x - 6, GROUND_Y + GROUND_HEIGHT);
        ctx.lineTo(x - 16, GROUND_Y + GROUND_HEIGHT);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      ctx.fillStyle = '#524b22';
      ctx.fillRect(0, GROUND_Y, V_WIDTH, 2);

      // Particles
      for (let i = eng.particles.length - 1; i >= 0; i--) {
        const pt = eng.particles[i];
        if (!eng.isPaused) {
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.life--;
        }

        if (pt.life <= 0) {
          eng.particles.splice(i, 1);
          continue;
        }

        const alpha = pt.life / pt.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Bird
      ctx.save();
      ctx.translate(eng.bird.x, eng.bird.y);
      ctx.rotate(eng.bird.rotation);

      // Ground shadow
      ctx.beginPath();
      ctx.ellipse(0, 16, 12, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fill();

      // Yellow Body
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 13, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#854d0e';
      ctx.stroke();

      // Belly
      ctx.beginPath();
      ctx.ellipse(-2, 4, 10, 7, -0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#fef08a';
      ctx.fill();

      // Wing
      ctx.save();
      ctx.translate(-5, 0);
      let wingOffsetY = 0;
      let wingAngle = 0;
      if (eng.bird.wingState === 0) {
        wingOffsetY = -4;
        wingAngle = -0.3;
      } else if (eng.bird.wingState === 2) {
        wingOffsetY = 4;
        wingAngle = 0.3;
      }
      ctx.rotate(wingAngle);
      ctx.beginPath();
      ctx.ellipse(0, wingOffsetY, 9, 6, -0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ca8a04';
      ctx.stroke();
      ctx.restore();

      // Blush
      ctx.beginPath();
      ctx.arc(4, 4, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.45)';
      ctx.fill();

      // Eye
      ctx.beginPath();
      ctx.arc(8, -4, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#451a03';
      ctx.stroke();

      // Pupil & Gleam
      ctx.beginPath();
      ctx.arc(9.5, -4, 2.3, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(10.5, -5.2, 1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Beak
      ctx.beginPath();
      ctx.moveTo(11, -1);
      ctx.lineTo(20, 2);
      ctx.lineTo(11, 6);
      ctx.closePath();
      ctx.fillStyle = '#ea580c';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#7c2d12';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(11, 2);
      ctx.lineTo(18, 2);
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();

      // Score in PLAYING
      if (eng.state === 'PLAYING') {
        const scStr = eng.score.toString();
        ctx.save();
        ctx.font = '900 48px "Impact", "Arial Black", sans-serif';
        ctx.textAlign = 'center';

        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillText(scStr, V_WIDTH / 2 + 2, 72);

        ctx.lineWidth = 5;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(scStr, V_WIDTH / 2, 70);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(scStr, V_WIDTH / 2, 70);
        ctx.restore();
      }

      // START Screen UI
      if (eng.state === 'START') {
        ctx.save();
        ctx.textAlign = 'center';

        ctx.font = '900 44px "Impact", "Arial Black", sans-serif';
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#27272a';
        ctx.strokeText('FLAPPY BIRD', V_WIDTH / 2, 140);
        ctx.fillStyle = '#facc15';
        ctx.fillText('FLAPPY BIRD', V_WIDTH / 2, 140);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(V_WIDTH / 2 - 110, 155, 220, 26, 13);
        } else {
          ctx.rect(V_WIDTH / 2 - 110, 155, 220, 26);
        }
        ctx.fill();

        ctx.font = '700 13px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('CANVAS ARCADE EDITION', V_WIDTH / 2, 172);

        const pulse = 1 + Math.sin(eng.frameCount * 0.1) * 0.05;
        ctx.save();
        ctx.translate(V_WIDTH / 2, 390);
        ctx.scale(pulse, pulse);

        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(-140, -32, 280, 64, 16);
        } else {
          ctx.rect(-140, -32, 280, 64);
        }
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.font = '900 18px sans-serif';
        ctx.fillStyle = '#78350f';
        ctx.fillText('PRESS SPACE OR CLICK', 0, -5);

        ctx.font = '700 13px sans-serif';
        ctx.fillStyle = '#451a03';
        ctx.fillText('TAP SCREEN TO FLAP', 0, 17);
        ctx.restore();

        // Best score preview
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(V_WIDTH / 2 - 80, 455, 160, 30, 8);
        } else {
          ctx.rect(V_WIDTH / 2 - 80, 455, 160, 30);
        }
        ctx.fill();

        ctx.font = '800 14px sans-serif';
        ctx.fillStyle = '#fde047';
        ctx.fillText(`BEST SCORE: ${localStorage.getItem('flappy_standalone_best') || 0}`, V_WIDTH / 2, 475);

        ctx.restore();
      }

      // GAMEOVER Screen UI
      if (eng.state === 'GAMEOVER') {
        ctx.save();
        ctx.textAlign = 'center';

        ctx.font = '900 42px "Impact", "Arial Black", sans-serif';
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#000000';
        ctx.strokeText('GAME OVER', V_WIDTH / 2, 140);
        ctx.fillStyle = '#ef4444';
        ctx.fillText('GAME OVER', V_WIDTH / 2, 140);

        const cardX = 40;
        const cardY = 175;
        const cardW = 320;
        const cardH = 200;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(cardX + 4, cardY + 6, cardW, cardH, 16);
        } else {
          ctx.rect(cardX + 4, cardY + 6, cardW, cardH);
        }
        ctx.fill();

        ctx.fillStyle = '#ded895';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        } else {
          ctx.rect(cardX, cardY, cardW, cardH);
        }
        ctx.fill();

        ctx.lineWidth = 4;
        ctx.strokeStyle = '#543847';
        ctx.stroke();

        ctx.strokeStyle = '#c4b572';
        ctx.lineWidth = 2;
        ctx.strokeRect(cardX + 10, cardY + 10, cardW - 20, cardH - 20);

        ctx.textAlign = 'left';
        ctx.font = '900 14px sans-serif';
        ctx.fillStyle = '#b45309';
        ctx.fillText('MEDAL', cardX + 32, cardY + 44);

        drawMedal(cardX + 54, cardY + 105, eng.score);

        ctx.textAlign = 'right';
        ctx.font = '800 13px sans-serif';
        ctx.fillStyle = '#b45309';
        ctx.fillText('SCORE', cardX + cardW - 32, cardY + 44);

        ctx.font = '900 36px "Impact", sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(eng.score.toString(), cardX + cardW - 32, cardY + 84);

        ctx.font = '800 13px sans-serif';
        ctx.fillStyle = '#b45309';
        ctx.fillText('BEST', cardX + cardW - 32, cardY + 124);

        const currentBest = parseInt(localStorage.getItem('flappy_standalone_best') || '0', 10);
        ctx.font = '900 36px "Impact", sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(currentBest.toString(), cardX + cardW - 32, cardY + 164);

        if (eng.score >= currentBest && eng.score > 0) {
          ctx.save();
          ctx.translate(cardX + cardW - 110, cardY + 100);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(-6, -10, 48, 18);
          ctx.font = '900 10px sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText('NEW', 18, 3);
          ctx.restore();
        }

        ctx.textAlign = 'center';
        const btnY = 410;
        const btnW = 220;
        const btnH = 54;
        const btnX = V_WIDTH / 2 - btnW / 2;

        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(btnX, btnY, btnW, btnH, 14);
        } else {
          ctx.rect(btnX, btnY, btnW, btnH);
        }
        ctx.fill();

        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.font = '900 22px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('PLAY AGAIN', V_WIDTH / 2, btnY + 34);

        ctx.font = '600 13px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillText('Press Spacebar or Click anywhere', V_WIDTH / 2, 492);

        ctx.restore();
      }

      // Flash
      if (eng.screenFlash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${eng.screenFlash})`;
        ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
        eng.screenFlash -= 0.12;
        if (eng.screenFlash < 0) eng.screenFlash = 0;
      }

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    }

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, [playSound, updateBestScore]);

  // Global keydown handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ') {
        e.preventDefault();
        engineRef.current.triggerAction();
      } else if (e.code === 'KeyP') {
        setIsPaused((p) => !p);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Fetch or copy standalone HTML
  const downloadStandaloneHTML = async () => {
    try {
      const res = await fetch('/flappy-bird.html');
      const htmlText = await res.text();
      const blob = new Blob([htmlText], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flappy-bird.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback
    }
  };

  const copyStandaloneHTML = async () => {
    try {
      const res = await fetch('/flappy-bird.html');
      const htmlText = await res.text();
      await navigator.clipboard.writeText(htmlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-neutral-100 p-2 sm:p-4 select-none">
      {/* Top Bar with Game Stats & Standalone Exporter */}
      <header className="w-full max-w-[440px] flex items-center justify-between mb-3 px-1 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
          <h1 className="font-black text-lg tracking-wider bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 bg-clip-text text-transparent">
            FLAPPY BIRD
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition active:scale-95"
            title={soundEnabled ? 'Mute Sound' : 'Enable Sound'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} className="text-red-400" />}
          </button>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition active:scale-95"
            title={isPaused ? 'Resume Game (P)' : 'Pause Game (P)'}
          >
            {isPaused ? <Play size={16} className="text-emerald-400" /> : <Pause size={16} />}
          </button>

          <button
            onClick={copyStandaloneHTML}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800 transition active:scale-95"
            title="Copy entire single standalone HTML file to clipboard"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span className="hidden xs:inline">{copied ? 'Copied!' : 'Copy HTML'}</span>
          </button>

          <button
            onClick={downloadStandaloneHTML}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition active:scale-95 shadow-sm"
            title="Download complete single-file flappy-bird.html"
          >
            <Download size={14} />
            <span className="hidden xs:inline">Save .html</span>
          </button>
        </div>
      </header>

      {/* Main Game Screen Canvas Container */}
      <div
        ref={containerRef}
        onClick={() => engineRef.current.triggerAction()}
        className="relative w-full max-w-[420px] aspect-[400/600] rounded-2xl overflow-hidden shadow-2xl border-4 border-neutral-800 bg-[#4ec0ca] cursor-pointer touch-none select-none transition-transform active:scale-[0.99]"
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
        />

        {/* Pause Overlay */}
        {isPaused && (
          <div className="absolute inset-0 bg-neutral-950/70 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-20">
            <div className="p-4 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
              <Pause size={36} />
            </div>
            <h2 className="text-2xl font-black tracking-widest text-white">PAUSED</h2>
            <p className="text-xs text-neutral-400">Click or press P to resume</p>
          </div>
        )}
      </div>

      {/* Instructions & Footnotes */}
      <footer className="w-full max-w-[420px] mt-3 flex items-center justify-between text-xs text-neutral-400 px-2 font-medium">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 font-mono text-neutral-300">Space</span>
          <span>or click / tap to jump</span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-400">
          <Trophy size={14} />
          <span>Best: {bestScore}</span>
        </div>
      </footer>
    </div>
  );
}
