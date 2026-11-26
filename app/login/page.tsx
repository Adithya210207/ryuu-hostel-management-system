import Auth from '../../components/portal/Auth';
import { demoEnabled } from '../../server/auth';
export default function LoginPage() { return <Auth demoEnabled={demoEnabled()} />; }
