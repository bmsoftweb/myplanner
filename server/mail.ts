import nodemailer from 'nodemailer';

/**
 * Envio de e-mail (ativação de conta, recuperação de senha, senha do usuário).
 *
 * Sem SMTP configurado no .env nada é enviado e o chamador recebe enviado=false —
 * as telas então mostram a chave em tela, para que o cadastro não trave.
 */
export function smtpConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

let transporte: nodemailer.Transporter | null = null;

function obterTransporte(): nodemailer.Transporter {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return transporte;
}

export async function enviarEmail(para: string, assunto: string, html: string): Promise<boolean> {
  if (!smtpConfigurado()) return false;
  try {
    await obterTransporte().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: para,
      subject: assunto,
      html,
    });
    return true;
  } catch (err) {
    console.warn('Falha ao enviar e-mail:', err);
    return false;
  }
}

/** Moldura comum das mensagens enviadas pelo sistema */
export function corpoEmail(titulo: string, conteudo: string): string {
  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1917">
      <div style="background:#1d4ed8;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:700;letter-spacing:.08em">
        MEU PLANEJAMENTO FINANCEIRO
      </div>
      <div style="border:1px solid #e7e5e4;border-top:0;border-radius:0 0 12px 12px;padding:24px 20px">
        <h2 style="margin:0 0 12px;font-size:18px">${titulo}</h2>
        ${conteudo}
      </div>
    </div>`;
}
