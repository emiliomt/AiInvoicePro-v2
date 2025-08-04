
"""
AnzuDynamics Classification Configuration
Handles settings and thresholds for invoice line item classification
"""

class AnzuDynamicsConfig:
    """Configuration class for AnzuDynamics invoice classification system"""
    
    CLASSIFICATION_CONFIG = {
        "categories": {
            "Consumable Materials": "Materials used up during construction/operations",
            "Non-Consumable Materials": "Durable materials and equipment that are reusable",
            "Labor": "Human resources and professional services", 
            "Tools & Equipment": "Tools, machinery, and equipment"
        },
        "confidence_threshold": 0.7,
        "auto_approve_threshold": 0.85
    }
    
    # Spanish language mappings for Colombian invoices
    SPANISH_KEYWORDS = {
        "Consumable Materials": [
            'cemento', 'concreto', 'arena', 'grava', 'varilla', 'alambre', 'clavos', 'tornillos',
            'pintura', 'combustible', 'gasolina', 'mortero', 'ladrillo', 'bloque', 'tubería'
        ],
        "Non-Consumable Materials": [
            'maquinaria', 'equipo', 'generador', 'compresor', 'bomba', 'motor', 'sistema',
            'panel eléctrico', 'transformador', 'válvula', 'medidor', 'activo'
        ],
        "Labor": [
            'mano de obra', 'trabajador', 'técnico', 'ingeniero', 'operador', 'mecánico',
            'electricista', 'soldador', 'supervisor', 'capataz', 'servicio', 'instalación',
            'mantenimiento', 'reparación', 'consultoría', 'horas', 'personal'
        ],
        "Tools & Equipment": [
            'taladro', 'martillo', 'llave', 'destornillador', 'sierra', 'amoladora',
            'soldadora', 'antorcha', 'alicates', 'abrazadera', 'nivel', 'medida',
            'herramienta', 'andamio', 'escalera', 'equipo de seguridad', 'casco'
        ]
    }
    
    @classmethod
    def get_confidence_threshold(cls):
        return cls.CLASSIFICATION_CONFIG["confidence_threshold"]
    
    @classmethod
    def get_auto_approve_threshold(cls):
        return cls.CLASSIFICATION_CONFIG["auto_approve_threshold"]
    
    @classmethod
    def should_auto_approve(cls, confidence: float) -> bool:
        return confidence >= cls.get_auto_approve_threshold()
    
    @classmethod
    def requires_manual_review(cls, confidence: float) -> bool:
        return confidence < cls.get_confidence_threshold()
