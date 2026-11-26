import Auth from '../../components/portal/Auth';
export default function LoginPage() { return <Auth demoEnabled={process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE === 'true'} />; }
