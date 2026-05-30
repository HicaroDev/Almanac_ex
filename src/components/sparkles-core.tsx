"use client";
import React from "react";
import { Particles, ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Container } from "@tsparticles/engine";
import { cn } from "@/lib/utils";

type SparklesProps = {
  id?: string;
  className?: string;
  particleSize?: number;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  particleColor?: string;
  particleDensity?: number;
};

function ParticlesInner(props: SparklesProps & { className?: string }) {
  const { id, className, minSize, maxSize, speed, particleColor, particleDensity } = props;
  return (
    <Particles
      id={id}
      className={cn("h-full w-full", className)}
      particlesLoaded={async (container?: Container) => {}}
      options={{
        background: { color: { value: "transparent" } },
        fullScreen: { enable: false, zIndex: 1 },
        fpsLimit: 120,
        interactivity: {
          events: {
            onClick: { enable: true, mode: "push" },
            onHover: { enable: false, mode: "repulse" },
            resize: true as any,
          },
          modes: {
            push: { quantity: 4 },
            repulse: { distance: 200, duration: 0.4 },
          },
        },
        particles: {
          color: { value: particleColor || "#ffffff" },
          move: {
            enable: true,
            speed: { min: 0.1, max: speed || 1 },
            direction: "none",
            random: false,
            straight: false,
            outModes: { default: "out" },
          },
          number: {
            density: { enable: true, width: 400, height: 400 },
            value: particleDensity || 120,
          },
          opacity: {
            value: { min: 0.1, max: 1 },
            animation: { enable: true, speed: 4, sync: false },
          },
          shape: { type: "circle" },
          size: {
            value: { min: minSize || 1, max: maxSize || 3 },
          },
        },
        detectRetina: true,
      }}
    />
  );
}

export function SparklesCore(props: SparklesProps) {
  const { className, ...rest } = props;
  return (
    <ParticlesProvider init={async (engine) => { await loadSlim(engine); }}>
      <ParticlesInner className={className} {...rest} />
    </ParticlesProvider>
  );
}
