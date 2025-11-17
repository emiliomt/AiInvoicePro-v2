import { motion } from 'motion/react';

import { Button } from "@/components/ui/button";

import { ArrowRight, CheckCircle } from "lucide-react";



const benefits = [

  "No credit card required",

  "14-day free trial",

  "Cancel anytime",

  "Full feature access"

];



export function CTA() {

  return (

    <section id="pricing" className="py-20 px-6">

      <div className="container mx-auto">

        <motion.div

          initial={{ opacity: 0, y: 20 }}

          whileInView={{ opacity: 1, y: 0 }}

          viewport={{ once: true }}

          transition={{ duration: 0.6 }}

          className="max-w-4xl mx-auto"

        >

          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-secondary p-12 md:p-16 text-center">

            {/* Background pattern */}

            <div className="absolute inset-0 opacity-10">

              <div className="absolute inset-0" style={{

                backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',

                backgroundSize: '40px 40px'

              }} />

            </div>



            <div className="relative z-10">

              <h2 className="text-4xl md:text-5xl font-semibold text-white mb-6">

                Ready to Transform Your Workflow?

              </h2>

              

              <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">

                Join thousands of businesses already saving time and money with AI-powered automation

              </p>



              <div className="flex flex-wrap justify-center gap-6 mb-8">

                {benefits.map((benefit, index) => (

                  <div key={index} className="flex items-center gap-2 text-white">

                    <CheckCircle className="w-5 h-5" />

                    <span>{benefit}</span>

                  </div>

                ))}

              </div>



              <div className="flex flex-wrap justify-center gap-4">

                <Button 

                  size="lg" 

                  className="bg-white text-primary hover:bg-white/90 gap-2"

                >

                  Start Free Trial

                  <ArrowRight className="w-4 h-4" />

                </Button>

                <Button 

                  size="lg" 

                  variant="outline"

                  className="border-white text-white hover:bg-white/10"

                >

                  Schedule Demo

                </Button>

              </div>

            </div>

          </div>

        </motion.div>

      </div>

    </section>

  );

}

