import { useState, useRef, useEffect, useCallback } from 'react';

interface VisualizerProps {
  isActive: boolean;
  style?: 'bars' | 'wave' | 'blob' | 'circular';
  colors?: string[];
  fullScreen?: boolean;
}

export default function Visualizer({ 
  isActive, 
  style = 'bars', 
  colors = ['#8b5cf6', '#3b82f6'], 
  fullScreen = false 
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const dataRef = useRef<number[]>(Array(64).fill(0));
  
  // Easing function for smooth animation
  const lerp = (start: number, end: number, t: number) => {
    return start * (1 - t) + end * t;
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Update fake frequency data
    if (isActive) {
      for (let i = 0; i < dataRef.current.length; i++) {
        // Lower frequencies (index 0-10) have more amplitude to simulate bass
        const maxAmp = i < 15 ? 1 : 0.6;
        const target = Math.random() * maxAmp;
        dataRef.current[i] = lerp(dataRef.current[i], target, 0.15);
      }
    } else {
      // Return to zero when inactive
      for (let i = 0; i < dataRef.current.length; i++) {
        dataRef.current[i] = lerp(dataRef.current[i], 0, 0.1);
      }
    }

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors[0] || '#8b5cf6');
    gradient.addColorStop(1, colors[1] || colors[0] || '#3b82f6');

    if (style === 'bars') {
      const barWidth = (width / 64) * 0.8;
      const spacing = (width / 64) * 0.2;
      
      for (let i = 0; i < 64; i++) {
        const val = dataRef.current[i];
        const barHeight = val * (height * 0.6);
        const x = i * (barWidth + spacing);
        const y = height / 2 - barHeight / 2;
        
        ctx.fillStyle = gradient;
        
        // Main bar
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
        
        // Reflection
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.roundRect(x, height / 2 + barHeight / 2 + 5, barWidth, barHeight * 0.4, barWidth / 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    } else if (style === 'wave') {
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      
      for (let i = 0; i < 64; i++) {
        const val = dataRef.current[i];
        const x = (width / 63) * i;
        const y = height / 2 + Math.sin(i * 0.5 + performance.now() * 0.002) * (val * height * 0.3);
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.shadowBlur = 20;
      ctx.shadowColor = colors[0];
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (style === 'blob') {
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.25;
      
      ctx.beginPath();
      for (let i = 0; i <= Math.PI * 2; i += 0.1) {
        const dataIndex = Math.floor((i / (Math.PI * 2)) * 32);
        const val = dataRef.current[dataIndex] || 0;
        
        const r = baseRadius + (val * baseRadius * 0.5) + Math.sin(i * 3 + performance.now() * 0.001) * 10;
        const x = centerX + Math.cos(i) * r;
        const y = centerY + Math.sin(i) * r;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      
      ctx.closePath();
      ctx.fillStyle = gradient;
      
      ctx.shadowBlur = 40;
      ctx.shadowColor = colors[0];
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Inner glowing core
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalAlpha = 1.0;
    } else if (style === 'circular') {
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.2;
      
      const rot = performance.now() * 0.0005;
      
      for (let i = 0; i < 64; i++) {
        const val = dataRef.current[i];
        const angle = (i / 64) * Math.PI * 2 + rot;
        const length = val * (Math.min(width, height) * 0.25);
        
        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + length);
        const y2 = centerY + Math.sin(angle) * (radius + length);
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      
      // Center circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    requestRef.current = requestAnimationFrame(draw);
  }, [isActive, style, colors]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    requestRef.current = requestAnimationFrame(draw);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(requestRef.current);
    };
  }, [draw]);

  const containerClasses = fullScreen
    ? 'fixed inset-0 z-40 bg-black/90 flex items-center justify-center'
    : 'relative w-full h-full min-h-[200px] bg-white/5 dark:bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden';

  return (
    <div className={containerClasses}>
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full"
      />
    </div>
  );
}
