"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { IconClock, IconCheck, IconBrandVscode } from "@tabler/icons-react";

export default function HeroAnimation() {
  const [step, setStep] = useState(0);
  const [timer, setTimer] = useState("00:00:00");

  // Simulation sequence
  const isStepZero = step === 0;
  useEffect(() => {
    const sequence = async () => {
      // Step 0: Idle
      await new Promise((r) => setTimeout(r, 1000));
      setStep(1); // Start Coding

      // Step 1: Coding & Timer starts
      let seconds = 0;
      const interval = setInterval(() => {
        seconds++;
        const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
        const s = (seconds % 60).toString().padStart(2, "0");
        setTimer(`${h}:${m}:${s}`);
      }, 100); // Fast forward time

      await new Promise((r) => setTimeout(r, 3000)); // Code for 3 seconds (simulated)
      clearInterval(interval);
      setStep(2); // Stop & Export

      await new Promise((r) => setTimeout(r, 2000));
      setStep(3); // Done
      
      await new Promise((r) => setTimeout(r, 2000));
      setStep(0); // Reset
      setTimer("00:00:00");
    };

    sequence();
  }, [isStepZero]); // Restart when step hits 0 again

  return (
    <div className="relative w-full max-w-lg mx-auto h-64 bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-800 font-mono text-sm">
      {/* VS Code Header */}
      <div className="h-8 bg-gray-800 flex items-center px-4 gap-2 border-b border-gray-700">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <div className="ml-4 text-gray-400 text-xs flex items-center gap-1">
          <IconBrandVscode size={14} />
          <span>index.ts — clockit-demo</span>
        </div>
      </div>

      {/* Editor Area */}
      <div className="p-4 text-gray-300">
        <div className="flex">
          <div className="text-gray-600 select-none mr-4 text-right w-6">1</div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-purple-400">function</span> <span className="text-blue-400">trackTime</span>() {"{"}
          </motion.div>
        </div>
        <div className="flex">
          <div className="text-gray-600 select-none mr-4 text-right w-6">2</div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: step >= 1 ? 1 : 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            &nbsp;&nbsp;<span className="text-blue-300">console</span>.<span className="text-yellow-300">log</span>(<span className="text-green-300">&quot;Coding...&quot;</span>);
          </motion.div>
        </div>
        <div className="flex">
          <div className="text-gray-600 select-none mr-4 text-right w-6">3</div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: step >= 1 ? 1 : 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            &nbsp;&nbsp;<span className="text-gray-500">Clockit is tracking this...</span>
          </motion.div>
        </div>
        <div className="flex">
          <div className="text-gray-600 select-none mr-4 text-right w-6">4</div>
          <div>{"}"}</div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="absolute bottom-0 w-full h-6 bg-[#007acc] text-white flex items-center px-3 justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <IconBrandVscode size={12} />
            <span>main*</span>
          </div>
          <div className="flex items-center gap-1">
          <span>0 errors</span>
          </div>
        </div>
        
        {/* Clockit Widget */}
        <motion.div 
          className="flex items-center gap-2 px-2 py-0.5 rounded hover:bg-white/10 cursor-pointer"
          animate={{ 
            backgroundColor: step === 1 ? "rgba(255,255,255,0.2)" : "transparent",
          }}
        >
          <IconClock size={12} className={step === 1 ? "animate-pulse" : ""} />
          <span className="font-medium tabular-nums">{timer}</span>
          {step === 2 && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1 text-green-200 ml-2"
            >
              <IconCheck size={12} />
              <span>Saved to CSV</span>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Floating Notification */}
      {step === 2 && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          className="absolute bottom-10 right-4 bg-gray-800 text-white p-3 rounded shadow-lg border border-gray-700 flex items-center gap-3 z-10"
        >
          <div className="bg-green-500/20 p-1.5 rounded text-green-400">
            <IconCheck size={16} />
          </div>
          <div>
            <div className="font-bold text-xs">Session Logged</div>
            <div className="text-[10px] text-gray-400">Exported to Jira & Notion</div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
