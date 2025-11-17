import { motion } from 'motion/react';

import { useState, useEffect } from 'react';



export function LoadingProgress() {

  const [progress, setProgress] = useState(0);



  useEffect(() => {

    const timer = setInterval(() => {

      setProgress(prev => {

        if (prev >= 100) return 0; // Reset for demo purposes

        return prev + Math.random() * 15;

      });

    }, 300);



    return () => clearInterval(timer);

  }, []);



  const clampedProgress = Math.min(progress, 100);



  return (

    <div className="w-full max-w-md">

      <div className="flex justify-between items-center mb-2">

        <span className="text-sm text-muted-foreground">Loading AI Engine</span>

        <span className="text-sm font-medium text-primary">{Math.round(clampedProgress)}%</span>

      </div>

      

      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">

        <motion.div

          className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"

          initial={{ width: 0 }}

          animate={{ width: `${clampedProgress}%` }}

          transition={{ duration: 0.3, ease: "easeOut" }}

        />

      </div>

    </div>

  );

}

