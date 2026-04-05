from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

Role = Literal['superadmin', 'admin', 'operador']


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)


class UserCreate(BaseModel):
    nombre: str
    email: EmailStr
    password: str = Field(..., min_length=6)
    rol: Role
    condominium_id: Optional[str] = None


class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=6)
    rol: Optional[Role] = None
    condominium_id: Optional[str] = None
    activo: Optional[bool] = None


class CondominiumCreate(BaseModel):
    nombre: str
    direccion: str
    porcentaje_alumbrado: float = 15.0
    cuenta_bancaria: str
    email_contacto: EmailStr
    logo_url: Optional[str] = None


class CondominiumUpdate(BaseModel):
    nombre: Optional[str] = None
    direccion: Optional[str] = None
    porcentaje_alumbrado: Optional[float] = None
    cuenta_bancaria: Optional[str] = None
    email_contacto: Optional[EmailStr] = None
    logo_url: Optional[str] = None


class HouseCreate(BaseModel):
    condominium_id: Optional[str] = None
    nombre_usuario: Optional[str] = ''
    numero_casa: str
    ubicacion: str
    serie_medidor: str
    serial_nuevo: Optional[str] = ''
    tipo_medidor: Optional[str] = 'digital'
    es_zona_comun: bool = False
    activo: bool = True


class HouseUpdate(BaseModel):
    nombre_usuario: Optional[str] = None
    numero_casa: Optional[str] = None
    ubicacion: Optional[str] = None
    serie_medidor: Optional[str] = None
    serial_nuevo: Optional[str] = None
    tipo_medidor: Optional[str] = None
    es_zona_comun: Optional[bool] = None
    activo: Optional[bool] = None


class BillingPeriodCreate(BaseModel):
    condominium_id: Optional[str] = None
    fecha_inicio: date
    fecha_fin: date


class BillingPeriodUpdate(BaseModel):
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    estado: Optional[Literal['abierto', 'calculado', 'cerrado']] = None


class MeterReadingUpsert(BaseModel):
    billing_period_id: str
    house_id: str
    lectura_anterior: float = Field(..., ge=0)
    lectura_actual: float = Field(..., ge=0)
    observaciones: Optional[str] = ''


class SupplierInvoiceUpsert(BaseModel):
    billing_period_id: str
    consumo_total_kwh: float = Field(..., ge=0)
    valor_consumo_total: float = Field(..., ge=0)
    valor_alumbrado_total: float = Field(default=0, ge=0)
    valor_aseo: float = Field(default=0, ge=0)
    total_factura: float = Field(..., ge=0)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user: dict
