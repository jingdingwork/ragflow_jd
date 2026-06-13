import Spotlight from '@/components/spotlight';
import SystemSetting from './components/system-setting';
import { UsedModel } from './components/used-model';
import { useSubmitSystemModelSetting } from './hooks';

const ModelProviders = () => {
  const { saveSystemModelSettingLoading, onSystemSettingSavingOk } =
    useSubmitSystemModelSetting();

  return (
    <div className="flex w-full border-[0.5px] border-border-button rounded-lg relative ">
      <Spotlight />
      <section className="flex flex-col gap-4 w-full px-5 overflow-auto scrollbar-auto">
        <SystemSetting
          onOk={onSystemSettingSavingOk}
          loading={saveSystemModelSettingLoading}
        />
        <UsedModel />
      </section>
    </div>
  );
};
export default ModelProviders;
