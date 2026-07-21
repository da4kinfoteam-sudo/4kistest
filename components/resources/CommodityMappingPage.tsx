
// Author: 4K 
import React from 'react';
import { Subproject, IPO } from '../../constants';
import SCADDashboard from '../dashboards/SCADDashboard';
import AgriculturalInterventionsDashboard from '../dashboards/AgriculturalInterventionsDashboard';
import { PageHeader } from '../ui/enterprise';

interface Props {
    subprojects: Subproject[];
    ipos: IPO[];
}

const CommodityMappingPage: React.FC<Props> = ({ subprojects, ipos }) => {
    return (
        <div className="commodity-mapping-page animate-fadeIn">
            <PageHeader
                title="Commodity Mapping & Interventions"
                metadata="Spatial and categorical tracking of agricultural commodities across domains."
            />
            
            <section>
                <SCADDashboard ipos={ipos} />
            </section>

            <section>
                <AgriculturalInterventionsDashboard subprojects={subprojects} />
            </section>
        </div>
    );
};

export default CommodityMappingPage;
