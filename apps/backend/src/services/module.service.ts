import { CreateModuleInput, UpdateModuleInput, ReorderItemsInput, ModuleSummaryDto, SafeUser } from '@edplatform/shared';
import { prisma } from '../config/prisma.config.js';
import { NotFoundError } from '../errors/app.error.js';
import { courseService } from './course.service.js';

export class ModuleService {
  /**
   * Creates a new module within a course.
   */
  async createModule(courseId: string, input: CreateModuleInput, user: SafeUser): Promise<ModuleSummaryDto> {
    await courseService.assertCourseOwnership(courseId, user);

    // Auto-calculate sortOrder if not provided or 0
    let sortOrder = input.sortOrder;
    if (!sortOrder) {
      const highestOrderModule = await prisma.module.findFirst({
        where: { courseId },
        orderBy: { sortOrder: 'desc' }
      });
      sortOrder = (highestOrderModule?.sortOrder ?? -1) + 1;
    }

    const newModule = await prisma.module.create({
      data: {
        title: input.title,
        description: input.description,
        sortOrder,
        courseId
      },
      include: {
        lessons: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    return {
      id: newModule.id,
      title: newModule.title,
      description: newModule.description,
      sortOrder: newModule.sortOrder,
      courseId: newModule.courseId,
      lessons: []
    };
  }

  /**
   * Updates an existing module.
   */
  async updateModule(moduleId: string, input: UpdateModuleInput, user: SafeUser): Promise<ModuleSummaryDto> {
    const existing = await prisma.module.findUnique({
      where: { id: moduleId },
      include: { course: true }
    });

    if (!existing) {
      throw new NotFoundError('Module not found');
    }

    await courseService.assertCourseOwnership(existing.courseId, user);

    const updated = await prisma.module.update({
      where: { id: moduleId },
      data: {
        ...(input.title && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder })
      },
      include: {
        lessons: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    return {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      sortOrder: updated.sortOrder,
      courseId: updated.courseId,
      lessons: updated.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        slug: l.slug,
        description: l.description,
        type: l.type,
        videoUrl: l.videoUrl,
        videoDuration: l.videoDuration,
        sortOrder: l.sortOrder,
        isFreePreview: l.isFreePreview,
        isPublished: l.isPublished,
        moduleId: l.moduleId
      }))
    };
  }

  /**
   * Deletes a module and cascades to lessons.
   */
  async deleteModule(moduleId: string, user: SafeUser): Promise<void> {
    const existing = await prisma.module.findUnique({
      where: { id: moduleId },
      include: { course: true }
    });

    if (!existing) {
      throw new NotFoundError('Module not found');
    }

    await courseService.assertCourseOwnership(existing.courseId, user);

    await prisma.module.delete({
      where: { id: moduleId }
    });
  }

  /**
   * Reorders modules in a course.
   */
  async reorderModules(courseId: string, input: ReorderItemsInput, user: SafeUser): Promise<void> {
    await courseService.assertCourseOwnership(courseId, user);

    await prisma.$transaction(
      input.items.map((item) =>
        prisma.module.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder }
        })
      )
    );
  }
}

export const moduleService = new ModuleService();
