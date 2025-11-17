import anzuLogo from '@/assets/anzu-logo.svg';

export function LogoIcon() {
  return (
    <img 
      src={anzuLogo} 
      alt="Anzu Dynamics" 
      className="h-10 w-10 object-contain" 
    />
  );
}
