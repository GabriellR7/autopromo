import { Link } from 'react-router-dom';
import { Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function ComingSoon({ title, description }: { title: string; description: string }) {
  useDocumentTitle(title);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <EmptyState
        icon={Hourglass}
        title="Coming in the next update"
        description={description}
        action={<Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button>}
      />
    </div>
  );
}
