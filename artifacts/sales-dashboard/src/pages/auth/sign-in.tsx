import { SignIn } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const hideGoogleAppearance = {
  elements: {
    socialButtonsBlock: { display: "none" },
    socialButtonsBlockButton: { display: "none" },
    socialButtonsBlockButtonArrow: { display: "none" },
    dividerRow: { display: "none" },
    dividerLine: { display: "none" },
    dividerText: { display: "none" },
  },
};

export default function SignInPage() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>
      <div className="relative z-10 w-full max-w-md">
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          appearance={hideGoogleAppearance}
        />
      </div>
    </div>
  );
}
