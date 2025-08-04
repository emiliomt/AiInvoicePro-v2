
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { lineItems } from '../../shared/schema';
import { eq, and, like, desc } from 'drizzle-orm';

const router = Router();

// AnzuDynamics specific invoice data with 50+ realistic line items
const sampleClassifiedItems = [
  // ALUTEMP SAS 01 00 - Construction materials
  {
    id: 1,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Mezcla de concreto premezclado 21MPa - 35 m³",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.94,
    amount: 4375000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["concreto", "premezclado", "m³"],
    timestamp: "2025-01-04T08:30:00Z"
  },
  {
    id: 2,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Varillas de acero corrugado #4 (12mm) - 2 toneladas",
    aiCategory: "NON_CONSUMABLE_MATERIALS",
    confidence: 0.92,
    amount: 3200000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["varillas", "acero", "corrugado"],
    timestamp: "2025-01-04T08:31:00Z"
  },
  {
    id: 3,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Agregado pétreo triturado 3/4\" - 50 m³",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.91,
    amount: 1750000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["agregado", "pétreo", "triturado"],
    timestamp: "2025-01-04T08:32:00Z"
  },
  {
    id: 4,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Cemento Portland tipo I - 150 sacos de 50kg",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.96,
    amount: 675000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["cemento", "portland", "sacos"],
    timestamp: "2025-01-04T08:33:00Z"
  },
  {
    id: 5,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Arena lavada fina para concreto - 25 m³",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.89,
    amount: 875000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["arena", "lavada", "concreto"],
    timestamp: "2025-01-04T08:34:00Z"
  },
  {
    id: 6,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Aditivo acelerante para concreto - 20 litros",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.87,
    amount: 340000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["aditivo", "acelerante", "concreto"],
    timestamp: "2025-01-04T08:35:00Z"
  },
  {
    id: 7,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Malla electrosoldada 6x6-10/10 - 50 m²",
    aiCategory: "NON_CONSUMABLE_MATERIALS",
    confidence: 0.90,
    amount: 1250000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["malla", "electrosoldada"],
    timestamp: "2025-01-04T08:36:00Z"
  },
  {
    id: 8,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Bloques de concreto 15x20x40cm - 800 unidades",
    aiCategory: "NON_CONSUMABLE_MATERIALS",
    confidence: 0.93,
    amount: 960000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["bloques", "concreto", "unidades"],
    timestamp: "2025-01-04T08:37:00Z"
  },
  {
    id: 9,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Mortero de pega para mampostería - 40 sacos",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.85,
    amount: 280000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["mortero", "pega", "mampostería"],
    timestamp: "2025-01-04T08:38:00Z"
  },
  {
    id: 10,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Impermeabilizante asfáltico - 15 galones",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.82,
    amount: 450000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["impermeabilizante", "asfáltico"],
    timestamp: "2025-01-04T08:39:00Z"
  },
  {
    id: 11,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Tubería PVC sanitaria 4\" - 100 metros",
    aiCategory: "NON_CONSUMABLE_MATERIALS",
    confidence: 0.88,
    amount: 650000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["tubería", "PVC", "sanitaria"],
    timestamp: "2025-01-04T08:40:00Z"
  },
  {
    id: 12,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Soldadura electrodo E6013 - 50 kg",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.94,
    amount: 375000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["soldadura", "electrodo"],
    timestamp: "2025-01-04T08:41:00Z"
  },

  // BOMAGRO INGENIERIA S.A.S. - Engineering services and labor
  {
    id: 13,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Servicios de ingeniería estructural - 120 horas",
    aiCategory: "LABOR",
    confidence: 0.95,
    amount: 4800000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["servicios", "ingeniería", "estructural"],
    timestamp: "2025-01-04T09:00:00Z"
  },
  {
    id: 14,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Mano de obra especializada soldadura - 40 horas",
    aiCategory: "LABOR",
    confidence: 0.93,
    amount: 1200000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["mano", "obra", "soldadura"],
    timestamp: "2025-01-04T09:01:00Z"
  },
  {
    id: 15,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Supervisión técnica de obra - 8 días",
    aiCategory: "LABOR",
    confidence: 0.91,
    amount: 2400000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["supervisión", "técnica", "obra"],
    timestamp: "2025-01-04T09:02:00Z"
  },
  {
    id: 16,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Installation of structural steel beams - 16 hours",
    aiCategory: "LABOR",
    confidence: 0.89,
    amount: 960000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["installation", "structural", "steel"],
    timestamp: "2025-01-04T09:03:00Z"
  },
  {
    id: 17,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Diseño y cálculo de cimentación - Proyecto completo",
    aiCategory: "LABOR",
    confidence: 0.94,
    amount: 3500000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["diseño", "cálculo", "cimentación"],
    timestamp: "2025-01-04T09:04:00Z"
  },
  {
    id: 18,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Mano de obra albañilería especializada - 60 horas",
    aiCategory: "LABOR",
    confidence: 0.92,
    amount: 1440000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["mano", "obra", "albañilería"],
    timestamp: "2025-01-04T09:05:00Z"
  },
  {
    id: 19,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Servicios de topografía y levantamiento - 3 días",
    aiCategory: "LABOR",
    confidence: 0.88,
    amount: 1080000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["topografía", "levantamiento"],
    timestamp: "2025-01-04T09:06:00Z"
  },
  {
    id: 20,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Quality control and testing services - 24 hours",
    aiCategory: "LABOR",
    confidence: 0.86,
    amount: 720000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["quality", "control", "testing"],
    timestamp: "2025-01-04T09:07:00Z"
  },
  {
    id: 21,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Instalación sistema eléctrico temporal - 32 horas",
    aiCategory: "LABOR",
    confidence: 0.90,
    amount: 1280000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["instalación", "eléctrico", "temporal"],
    timestamp: "2025-01-04T09:08:00Z"
  },
  {
    id: 22,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Coordinación y logística de obra - 5 días",
    aiCategory: "LABOR",
    confidence: 0.87,
    amount: 1250000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["coordinación", "logística", "obra"],
    timestamp: "2025-01-04T09:09:00Z"
  },

  // COMPANIA GLOBAL DE PINTURAS S.A.S. - Paint supplies and application services (2 invoices)
  {
    id: 23,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Pintura anticorrosiva epóxica - 200 galones",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.96,
    amount: 6000000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["pintura", "anticorrosiva", "epóxica"],
    timestamp: "2025-01-04T10:00:00Z"
  },
  {
    id: 24,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Aplicación de pintura industrial - mano de obra",
    aiCategory: "LABOR",
    confidence: 0.94,
    amount: 2400000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["aplicación", "pintura", "industrial"],
    timestamp: "2025-01-04T10:01:00Z"
  },
  {
    id: 25,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Thinner industrial para preparación - 50 galones",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.92,
    amount: 750000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["thinner", "industrial", "preparación"],
    timestamp: "2025-01-04T10:02:00Z"
  },
  {
    id: 26,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Primer anticorrosivo base agua - 100 galones",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.89,
    amount: 2200000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["primer", "anticorrosivo", "agua"],
    timestamp: "2025-01-04T10:03:00Z"
  },
  {
    id: 27,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Masilla plástica para reparaciones - 25 kg",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.85,
    amount: 375000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["masilla", "plástica", "reparaciones"],
    timestamp: "2025-01-04T10:04:00Z"
  },
  {
    id: 28,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Rodillos y brochas profesionales - Kit completo",
    aiCategory: "TOOLS_EQUIPMENT",
    confidence: 0.88,
    amount: 280000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["rodillos", "brochas", "profesionales"],
    timestamp: "2025-01-04T10:05:00Z"
  },
  {
    id: 29,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Preparación de superficies - 80 m² - mano de obra",
    aiCategory: "LABOR",
    confidence: 0.91,
    amount: 1600000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["preparación", "superficies", "mano"],
    timestamp: "2025-01-04T10:06:00Z"
  },
  {
    id: 30,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Lija al agua grano 220 - 100 hojas",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.83,
    amount: 150000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["lija", "agua", "grano"],
    timestamp: "2025-01-04T10:07:00Z"
  },
  {
    id: 31,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Pintura de acabado poliuretano - 150 galones",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.95,
    amount: 5250000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["pintura", "acabado", "poliuretano"],
    timestamp: "2025-01-04T10:08:00Z"
  },
  {
    id: 32,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Sellador acrílico transparente - 30 galones",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.87,
    amount: 900000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["sellador", "acrílico", "transparente"],
    timestamp: "2025-01-04T10:09:00Z"
  },
  {
    id: 33,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Equipo de aspersión neumático - alquiler 5 días",
    aiCategory: "TOOLS_EQUIPMENT",
    confidence: 0.90,
    amount: 750000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["equipo", "aspersión", "alquiler"],
    timestamp: "2025-01-04T10:10:00Z"
  },
  {
    id: 34,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Cinta de enmascarar profesional - 20 rollos",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.80,
    amount: 120000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["cinta", "enmascarar", "profesional"],
    timestamp: "2025-01-04T10:11:00Z"
  },

  // Second invoice from COMPANIA GLOBAL DE PINTURAS S.A.S.
  {
    id: 35,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Pintura arquitectónica exterior - 180 galones",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.93,
    amount: 4320000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["pintura", "arquitectónica", "exterior"],
    timestamp: "2025-01-04T11:00:00Z"
  },
  {
    id: 36,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Aplicación pintura fachada - 200 m² - labor",
    aiCategory: "LABOR",
    confidence: 0.91,
    amount: 3200000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["aplicación", "fachada", "labor"],
    timestamp: "2025-01-04T11:01:00Z"
  },
  {
    id: 37,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Base coat sealer - 80 galones",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.86,
    amount: 1600000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["base", "coat", "sealer"],
    timestamp: "2025-01-04T11:02:00Z"
  },
  {
    id: 38,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Andamios tubulares - alquiler 10 días",
    aiCategory: "TOOLS_EQUIPMENT",
    confidence: 0.89,
    amount: 1500000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["andamios", "tubulares", "alquiler"],
    timestamp: "2025-01-04T11:03:00Z"
  },
  {
    id: 39,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Imprimante sellador para concreto - 60 galones",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.88,
    amount: 1320000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["imprimante", "sellador", "concreto"],
    timestamp: "2025-01-04T11:04:00Z"
  },
  {
    id: 40,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Limpieza y preparación superficies - 48 horas labor",
    aiCategory: "LABOR",
    confidence: 0.92,
    amount: 1440000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["limpieza", "preparación", "superficies"],
    timestamp: "2025-01-04T11:05:00Z"
  },
  {
    id: 41,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Resane y reparación grietas - materiales y labor",
    aiCategory: "LABOR",
    confidence: 0.85,
    amount: 980000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["resane", "reparación", "grietas"],
    timestamp: "2025-01-04T11:06:00Z"
  },
  {
    id: 42,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Protección y enmascarado - 16 horas labor",
    aiCategory: "LABOR",
    confidence: 0.87,
    amount: 480000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["protección", "enmascarado", "labor"],
    timestamp: "2025-01-04T11:07:00Z"
  },
  {
    id: 43,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Diluyente para pintura exterior - 40 galones",
    aiCategory: "CONSUMABLE_MATERIALS",
    confidence: 0.90,
    amount: 600000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["diluyente", "pintura", "exterior"],
    timestamp: "2025-01-04T11:08:00Z"
  },
  {
    id: 44,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Compressor rental for spray equipment - 7 days",
    aiCategory: "TOOLS_EQUIPMENT",
    confidence: 0.84,
    amount: 840000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["compressor", "rental", "spray"],
    timestamp: "2025-01-04T11:09:00Z"
  },
  {
    id: 45,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Control de calidad y retoque final - 24 horas",
    aiCategory: "LABOR",
    confidence: 0.89,
    amount: 720000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["control", "calidad", "retoque"],
    timestamp: "2025-01-04T11:10:00Z"
  },
  {
    id: 46,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Limpieza post-trabajo y disposición residuos",
    aiCategory: "LABOR",
    confidence: 0.86,
    amount: 350000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["limpieza", "disposición", "residuos"],
    timestamp: "2025-01-04T11:11:00Z"
  },

  // Additional construction industry line items for completeness
  {
    id: 47,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Excavación y movimiento de tierras - 8 horas maquina",
    aiCategory: "LABOR",
    confidence: 0.88,
    amount: 1200000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["excavación", "movimiento", "tierras"],
    timestamp: "2025-01-04T12:00:00Z"
  },
  {
    id: 48,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Ensayos de resistencia concreto - 15 cilindros",
    aiCategory: "LABOR",
    confidence: 0.91,
    amount: 450000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["ensayos", "resistencia", "concreto"],
    timestamp: "2025-01-04T12:01:00Z"
  },
  {
    id: 49,
    invoiceId: "FVE753_900432430",
    vendor: "ALUTEMP SAS 01 00",
    description: "Geotextil no tejido - 200 m²",
    aiCategory: "NON_CONSUMABLE_MATERIALS",
    confidence: 0.82,
    amount: 600000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["geotextil", "no", "tejido"],
    timestamp: "2025-01-04T12:02:00Z"
  },
  {
    id: 50,
    invoiceId: "BIO1399_900449871",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Safety equipment and PPE - complete set",
    aiCategory: "TOOLS_EQUIPMENT",
    confidence: 0.79,
    amount: 580000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["safety", "equipment", "PPE"],
    timestamp: "2025-01-04T12:03:00Z"
  },
  {
    id: 51,
    invoiceId: "PNAL186682_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Medición y cuantificación de áreas - servicios",
    aiCategory: "LABOR",
    confidence: 0.87,
    amount: 320000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["medición", "cuantificación", "áreas"],
    timestamp: "2025-01-04T12:04:00Z"
  },
  {
    id: 52,
    invoiceId: "PNAL186683_890900148",
    vendor: "COMPANIA GLOBAL DE PINTURAS S.A.S.",
    description: "Garantía y mantenimiento 1 año - servicio",
    aiCategory: "LABOR",
    confidence: 0.83,
    amount: 450000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["garantía", "mantenimiento", "servicio"],
    timestamp: "2025-01-04T12:05:00Z"
  }
];

// Get all classification results
router.get('/', async (req, res) => {
  try {
    // For now, return sample data
    // In production, you would query your actual database
    res.json(sampleClassifiedItems);
  } catch (error) {
    console.error('Error fetching classification results:', error);
    res.status(500).json({ error: 'Failed to fetch classification results' });
  }
});

// Get classification statistics
router.get('/stats', async (req, res) => {
  try {
    const items = sampleClassifiedItems;
    const totalItems = items.length;
    const autoApproved = items.filter(item => item.status === 'auto_approved').length;
    const needingReview = items.filter(item => item.status === 'needs_review').length;
    const totalConfidence = items.reduce((sum, item) => sum + item.confidence, 0);
    
    const categoryCounts = items.reduce((acc, item) => {
      acc[item.aiCategory] = (acc[item.aiCategory] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const stats = {
      totalItems,
      autoApprovalRate: Math.round((autoApproved / totalItems) * 100),
      itemsNeedingReview: needingReview,
      averageConfidence: Math.round((totalConfidence / totalItems) * 100),
      categoryCounts
    };

    res.json(stats);
  } catch (error) {
    console.error('Error calculating classification stats:', error);
    res.status(500).json({ error: 'Failed to calculate classification statistics' });
  }
});

// Update a classification result
const updateClassificationSchema = z.object({
  category: z.string(),
  overrideReason: z.string(),
  status: z.enum(['auto_approved', 'needs_review', 'manual_override', 'rejected'])
});

router.patch('/:id', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const { category, overrideReason, status } = updateClassificationSchema.parse(req.body);

    // For demo purposes, simulate successful update
    // In production, you would update your database
    console.log(`Updating classification ${itemId}:`, {
      category,
      overrideReason,
      status,
      updatedBy: (req.user as any)?.id || 'system',
      updatedAt: new Date().toISOString()
    });

    res.json({ 
      success: true, 
      message: 'Classification updated successfully',
      id: itemId
    });
  } catch (error) {
    console.error('Error updating classification:', error);
    res.status(500).json({ error: 'Failed to update classification' });
  }
});

// Bulk approve classifications
const bulkApproveSchema = z.object({
  itemIds: z.array(z.number())
});

router.post('/bulk-approve', async (req, res) => {
  try {
    const { itemIds } = bulkApproveSchema.parse(req.body);

    // For demo purposes, simulate successful bulk approval
    // In production, you would update your database
    console.log(`Bulk approving ${itemIds.length} items:`, itemIds);

    res.json({ 
      success: true, 
      message: `Successfully approved ${itemIds.length} items`,
      approvedCount: itemIds.length
    });
  } catch (error) {
    console.error('Error bulk approving items:', error);
    res.status(500).json({ error: 'Failed to bulk approve items' });
  }
});

// Export classification results
router.post('/export', async (req, res) => {
  try {
    const { itemIds, format = 'csv' } = req.body;
    
    // Get items to export
    let itemsToExport = sampleClassifiedItems;
    if (itemIds && itemIds.length > 0) {
      itemsToExport = sampleClassifiedItems.filter(item => itemIds.includes(item.id));
    }

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'Invoice ID',
        'Vendor',
        'Description', 
        'AI Category',
        'Confidence',
        'Amount',
        'Currency',
        'Status',
        'Keywords Matched',
        'Timestamp'
      ];

      const csvContent = [
        headers.join(','),
        ...itemsToExport.map(item => [
          item.invoiceId,
          `"${item.vendor}"`,
          `"${item.description}"`,
          item.aiCategory,
          (item.confidence * 100).toFixed(1) + '%',
          item.amount,
          item.currency,
          item.status,
          `"${item.keywordsMatched.join(', ')}"`,
          item.timestamp
        ].join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="classification-results.csv"');
      res.send(csvContent);
    } else {
      // For Excel export, you would typically use a library like exceljs
      // For now, return CSV format
      res.status(400).json({ error: 'Excel export not implemented yet' });
    }
  } catch (error) {
    console.error('Error exporting classification results:', error);
    res.status(500).json({ error: 'Failed to export classification results' });
  }
});

export default router;
// This file ensures the routes directory exists
