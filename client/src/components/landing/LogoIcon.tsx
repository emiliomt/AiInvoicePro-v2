import { motion } from 'motion/react';

import anzuLogo from '@/assets/anzu-logo.svg';



export function LogoIcon() {

  return (

    <motion.div

      className="relative w-24 h-24 mb-8"

      initial={{ opacity: 0, scale: 0.5 }}

      animate={{ opacity: 1, scale: 1 }}

      transition={{ duration: 0.6, ease: "easeOut" }}

    >

      {/* Anzu Dynamics Logo */}

      <motion.img

        src={anzuLogo}

        alt="Anzu Dynamics"

        className="w-full h-full object-cover object-left"

        animate={{ 

          y: [0, -8, 0],

        }}

        transition={{ 

          duration: 3, 

          repeat: Infinity, 

          ease: "easeInOut" 

        }}

      />

    </motion.div>

  );

}
