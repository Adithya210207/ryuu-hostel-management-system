export default function BrandLogo({size = 44}: {size?: number}) {
  const height = Math.round(size * 68 / 104);
  return <img src="/images/ryuu-house-logo.png" alt="Ryuu house logo" width={size} height={height} style={{display:'block',width:size,height,maxWidth:size,objectFit:'contain',flexShrink:0}} />;
}
