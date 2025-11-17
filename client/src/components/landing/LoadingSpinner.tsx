import { motion } from 'motion/react';



export function LoadingSpinner() {

  return (

    <div className="relative w-16 h-16">

      {/* Outer ring */}

      <motion.div

        className="absolute inset-0 border-4 border-secondary/20 rounded-full"

        initial={{ opacity: 0 }}

        animate={{ opacity: 1 }}

        transition={{ duration: 0.5 }}

      />

      

      {/* Spinning ring */}

      <motion.div

        className="absolute inset-0 border-4 border-transparent border-t-primary rounded-full"

        animate={{ rotate: 360 }}

        transition={{

          duration: 1,

          repeat: Infinity,

          ease: "linear"

        }}

      />

      

      {/* Inner dot */}

      <motion.div

        className="absolute top-1/2 left-1/2 w-2 h-2 bg-secondary rounded-full transform -translate-x-1/2 -translate-y-1/2"

        animate={{

          scale: [1, 1.2, 1],

          opacity: [0.7, 1, 0.7]

        }}

        transition={{

          duration: 1.5,

          repeat: Infinity,

          ease: "easeInOut"

        }}

      />

    </div>

  );

}

