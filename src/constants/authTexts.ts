import type { AccountType, AccountTypeId } from "../types/account";

export type AuthHeaderContent = {
  title: string;
  description: string;
};

export const AuthHeaderTexts = {
  login: (type: AccountType | AccountTypeId): AuthHeaderContent => {
    if (type === "company" || type === "b") return { title: "İşveren Girişi", description: "Şirket hesabınıza giriş yapın." };
    if (type === "admin" || type === "a") return { title: "Yönetici Girişi", description: "Yönetim paneline giriş yapın." };
    if (type === "community" || type === "co") return { title: "Topluluk Girişi", description: "Topluluk hesabınıza giriş yapın." };
    
    return { title: "Aday Girişi", description: "Kariyerinize giriş yapın." };
  },

  register: (type: AccountType | AccountTypeId): AuthHeaderContent => {
    if (type === "company" || type === "b") return { title: "Kurumsal Kayıt", description: "Şirketiniz için yetenekleri keşfedin." };
    if (type === "admin" || type === "a") return { title: "Yönetici Kaydı", description: "Yönetici hesabı oluşturun." };
    if (type === "community" || type === "co") return { title: "Topluluk Kaydı", description: "Topluluk hesabınızı oluşturun." };

    return { title: "Hesabını Oluştur", description: "Kariyerine bir adım daha yaklaş." };
  },

  forgotPassword: (isSuccess: boolean): AuthHeaderContent => {
    if (isSuccess) return { title: "E-Postanı Kontrol Et", description: "Sıfırlama bağlantısını ilettik." };
    return { title: "Şifreni Sıfırla", description: "Sıfırlama için bir e-posta göndereceğiz." };
  },

  resetPassword: (): AuthHeaderContent => ({
    title: "Yeni Bir Şifre Belirle",
    description: "Lütfen yeni ve güçlü bir şifre belirleyin."
  }),

  verify: (): AuthHeaderContent => ({
    title: "E-Postanı Kontrol Et",
    description: "Doğrulama kodunu buraya gönderdik."
  }),

  migrate: (): AuthHeaderContent => ({
    title: "Kariyer Zamanı",
    description: "Hesabınızı yeni sisteme taşıyın."
  }),

  callbackError: (): AuthHeaderContent => ({
    title: "Doğrulama Başarısız",
    description: "Güvenli bağlantınızı sağlayamadık."
  })
} as const;