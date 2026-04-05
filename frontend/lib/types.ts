export type Role = 'superadmin' | 'admin' | 'operador';

export type SessionUser = {
  _id: string;
  nombre: string;
  email: string;
  rol: Role;
  condominium_id?: string | null;
};

export type SessionData = {
  token: string;
  user: SessionUser;
};

export type Condominium = {
  _id: string;
  nombre: string;
  direccion: string;
  porcentaje_alumbrado: number;
  cuenta_bancaria: string;
  email_contacto: string;
  logo_url?: string | null;
};
