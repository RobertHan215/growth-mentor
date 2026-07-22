import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      isPublished,
      categoryId,
      tagIds,
      directorConfig,
      name,
      visibilityRoles,
      visibilityUsers,
      coverImage,
      oneOnOneTagId,
    } = await req.json();

    // Begin a transaction because we need to clear and recreate tags
    const course = await prisma.$transaction(async (tx) => {
      const existingStage =
        directorConfig !== undefined && isPlainRecord(directorConfig)
          ? await tx.stage.findUnique({
              where: { id },
              select: { directorConfig: true },
            })
          : null;
      const existingDirectorConfig = isPlainRecord(existingStage?.directorConfig)
        ? existingStage.directorConfig
        : {};
      const nextDirectorConfig =
        directorConfig !== undefined
          ? isPlainRecord(directorConfig)
            ? { ...existingDirectorConfig, ...directorConfig }
            : directorConfig
          : undefined;

      // Update core fields
      const updatedStage = await tx.stage.update({
        where: { id },
        data: {
          name: name !== undefined ? name : undefined,
          isPublished: typeof isPublished === 'boolean' ? isPublished : undefined,
          categoryId: categoryId !== undefined ? categoryId : undefined,
          directorConfig: nextDirectorConfig,
          visibilityRoles: visibilityRoles !== undefined ? visibilityRoles : undefined,
          visibilityUsers: visibilityUsers !== undefined ? visibilityUsers : undefined,
          coverImage: coverImage !== undefined ? coverImage : undefined,
          oneOnOneTagId: oneOnOneTagId !== undefined ? oneOnOneTagId : undefined,
        },
      });

      // Update tags if provided
      if (Array.isArray(tagIds)) {
        // Delete all existing mappings
        await tx.stageTag.deleteMany({
          where: { stageId: id },
        });

        // Create new mappings
        if (tagIds.length > 0) {
          await tx.stageTag.createMany({
            data: tagIds.map((tagId) => ({
              stageId: id,
              tagId,
            })),
          });
        }
      }

      return updatedStage;
    });

    return NextResponse.json(course);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.stage.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

