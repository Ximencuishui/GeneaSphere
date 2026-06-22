SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'discussion_groups') as discussion_groups_exists;
