import { useEffect } from 'react';
import { useApp } from './store';
import Launcher from './views/Launcher';
import Overlay from './views/Overlay';

function currentView(): 'launcher' | 'overlay' {
  return window.location.hash.includes('overlay') ? 'overlay' : 'launcher';
}

export default function App() {
  const view = currentView();
  const loaded = useApp((s) => s.loaded);
  const init = useApp((s) => s.init);

  useEffect(() => {
    document.body.classList.toggle('overlay-body', view === 'overlay');
    void init();
  }, [init, view]);

  if (!loaded) {
    return <div className={view === 'overlay' ? 'overlay-loading' : 'launcher-loading'}>Loading player database…</div>;
  }
  return view === 'overlay' ? <Overlay /> : <Launcher />;
}
