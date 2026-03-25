import { getIronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface AdminSession {
  isAdmin?: boolean;
}

const sessionOptions: SessionOptions = {
  cookieName: 'gipc_vote_admin',
  password: process.env.SESSION_SECRET!,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8, // 8 hours
  },
};

export async function getAdminSession() {
  return getIronSession<AdminSession>(await cookies(), sessionOptions);
}
