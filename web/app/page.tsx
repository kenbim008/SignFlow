import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: todos } = await supabase.from('todos').select();

  return (
    <main style={{ padding: '1.5rem', fontFamily: 'system-ui' }}>
      <h1>Todos</h1>
      <ul>
        {todos?.map((todo: { id: string | number; name?: string }) => (
          <li key={String(todo.id)}>{todo.name ?? '(no name)'}</li>
        ))}
      </ul>
      {(!todos || todos.length === 0) && (
        <p style={{ color: '#666' }}>
          No rows yet. Create a <code>todos</code> table in Supabase with at least <code>id</code> and{' '}
          <code>name</code>.
        </p>
      )}
    </main>
  );
}
