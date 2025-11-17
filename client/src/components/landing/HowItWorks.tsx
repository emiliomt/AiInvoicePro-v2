import { motion } from 'motion/react';

import { Upload, Cpu, CheckCircle } from "lucide-react";



const steps = [

  {

    icon: Upload,

    title: "Connect Your Systems",

    description: "Integrate Anzu Dynamics with your existing tools and workflows in minutes.",

    step: "01"

  },

  {

    icon: Cpu,

    title: "AI Learns Your Process",

    description: "Our intelligent AI analyzes your workflows and identifies automation opportunities.",

    step: "02"

  },

  {

    icon: CheckCircle,

    title: "Automate & Optimize",

    description: "Sit back as tasks are completed automatically, with continuous improvement over time.",

    step: "03"

  }

];



export function HowItWorks() {

  return (

    <section id="how-it-works" className="py-20 px-6">

      <div className="container mx-auto">

        <motion.div

          initial={{ opacity: 0, y: 20 }}

          whileInView={{ opacity: 1, y: 0 }}

          viewport={{ once: true }}

          transition={{ duration: 0.6 }}

          className="text-center mb-16"

        >

          <h2 className="text-4xl font-semibold text-foreground mb-4">

            How It Works

          </h2>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">

            Get started with AI automation in three simple steps

          </p>

        </motion.div>



        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">

          {steps.map((step, index) => {

            const Icon = step.icon;

            return (

              <motion.div

                key={index}

                initial={{ opacity: 0, y: 20 }}

                whileInView={{ opacity: 1, y: 0 }}

                viewport={{ once: true }}

                transition={{ duration: 0.6, delay: index * 0.2 }}

                className="relative"

              >

                {/* Connection Line */}

                {index < steps.length - 1 && (

                  <div className="hidden md:block absolute top-16 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary to-secondary opacity-30" />

                )}



                <div className="text-center">

                  <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary mb-6">

                    <div className="absolute inset-1 bg-background rounded-full flex items-center justify-center">

                      <Icon className="w-8 h-8 text-primary" />

                    </div>

                  </div>

                  

                  <div className="text-4xl font-semibold text-primary/20 mb-2">

                    {step.step}

                  </div>

                  

                  <h3 className="font-semibold text-foreground mb-3">

                    {step.title}

                  </h3>

                  

                  <p className="text-muted-foreground">

                    {step.description}

                  </p>

                </div>

              </motion.div>

            );

          })}

        </div>

      </div>

    </section>

  );

}

