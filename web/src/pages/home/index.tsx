import { PageContainer } from '@/layouts/components/page-container';
import { Announcements } from './announcement-list';
import { Applications } from './applications';
import { NextBanner } from './banner';
import { Datasets } from './datasets';

const Home = () => {
  return (
    <PageContainer>
      <article>
        <header className="mb-8">
          <NextBanner />
        </header>

        <Announcements />
        <Datasets />
        <Applications />
      </article>
    </PageContainer>
  );
};

export default Home;
