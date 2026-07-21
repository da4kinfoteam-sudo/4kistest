
import React from 'react';
import { EmptyState } from '../ui/enterprise';

const NutritionDashboard: React.FC = () => {
    return (
        <div className="content-card animate-fadeIn">
            <EmptyState
                title="Nutrition Dashboard"
                message="Nutrition-related indicators and project impacts will appear here when records are available."
            />
        </div>
    );
};

export default NutritionDashboard;
